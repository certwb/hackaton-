import { Bot, Loader2, MessageCircle, Send, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { Checkpoint } from '../types';

interface Message {
  role: 'user' | 'bot';
  text: string;
}

const QUICK = [
  'Какой КПП сейчас свободнее?',
  'Сколько ждать на Темир-Баба?',
  'Когда лучше ехать сегодня?',
  'Есть ли перегрузка?',
  'Какой маршрут выбрать?',
];

function loadPct(checkpoint: Checkpoint) {
  return Math.round((checkpoint.current_queue / Math.max(checkpoint.capacity_per_hour, 1)) * 100);
}

function findCheckpoint(question: string, checkpoints: Checkpoint[]) {
  const aliases = [
    ['карабогаз', 'Карабогаз'],
    ['karabogaz', 'Карабогаз'],
    ['темир', 'Темир'],
    ['temir', 'Темир'],
    ['тажен', 'Тажен'],
    ['tazhen', 'Тажен'],
    ['порт', 'Порт'],
    ['актау', 'Актау'],
    ['aktau', 'Актау'],
  ];
  const text = question.toLowerCase();
  const match = aliases.find(([alias]) => text.includes(alias));
  if (!match) return undefined;
  return checkpoints.find((checkpoint) => checkpoint.name.includes(match[1]));
}

function checkpointCandidates(question: string, checkpoints: Checkpoint[]) {
  const text = question.toLowerCase();
  const land = checkpoints.filter((checkpoint) => checkpoint.type === 'land');
  if (text.includes('ашхабад') || text.includes('туркмен') || text.includes('туркменбаш') || text.includes('тм')) {
    const tm = land.filter((checkpoint) => checkpoint.name.includes('Карабогаз') || checkpoint.name.includes('Темир'));
    return tm.length > 0 ? tm : land;
  }
  if (text.includes('ташкент') || text.includes('узбек') || text.includes('узб') || text.includes('даут') || text.includes('каракалпак')) {
    const uz = land.filter((checkpoint) => checkpoint.name.includes('Тажен'));
    return uz.length > 0 ? uz : land;
  }
  return land.length > 0 ? land : checkpoints;
}

function localCheckpointReply(question: string, checkpoints: Checkpoint[]) {
  const text = question.toLowerCase();
  const candidates = checkpointCandidates(question, checkpoints);
  if (checkpoints.length === 0) {
    return 'API чата временно недоступен, и данные КПП не загрузились. Проверьте backend-деплой и переменную VITE_API_URL.';
  }

  if (text.includes('перегруз') || text.includes('загруж') || text.includes('нагруз')) {
    const overloaded = checkpoints
      .filter((checkpoint) => checkpoint.current_queue / Math.max(checkpoint.capacity_per_hour, 1) >= 0.8)
      .sort((a, b) => loadPct(b) - loadPct(a));
    if (overloaded.length === 0) {
      const avgWait = Math.round(checkpoints.reduce((sum, checkpoint) => sum + checkpoint.wait_minutes, 0) / checkpoints.length);
      return `Перегрузки нет. Среднее ожидание по точкам — ${avgWait} мин, все КПП ниже порога 80% загрузки.`;
    }
    return `Да, перегрузка есть: ${overloaded
      .map(
        (checkpoint) =>
          `${checkpoint.name} — ${loadPct(checkpoint)}%, очередь ${checkpoint.current_queue} авто, ожидание ${checkpoint.wait_minutes} мин`,
      )
      .join('; ')}.`;
  }

  const target = findCheckpoint(text, checkpoints);
  if (target && (text.includes('сколько') || text.includes('ждать') || text.includes('очеред'))) {
    return `${target.name}: очередь ${target.current_queue} авто, ожидание ${target.wait_minutes} мин, загрузка ${loadPct(target)}%, статус ${target.status}.`;
  }

  const best = [...candidates].sort((a, b) => a.wait_minutes - b.wait_minutes || a.current_queue - b.current_queue)[0];
  if (!best) {
    return 'Данные КПП временно недоступны.';
  }

  if (text.includes('когда') || text.includes('ехать') || text.includes('время')) {
    if (best.wait_minutes < 60) {
      return `Лучше ехать сейчас через ${best.name}: ожидание ${best.wait_minutes} мин, очередь ${best.current_queue} авто.`;
    }
    const recommendedTime = new Date(Date.now() + best.wait_minutes * 60000).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `Лучше планировать въезд после ${recommendedTime} через ${best.name}. Сейчас там ожидание ${best.wait_minutes} мин и очередь ${best.current_queue} авто.`;
  }

  if (text.includes('маршрут')) {
    const routeName = best.name.includes('Тажен') ? 'Актау - Бейнеу - КПП Тажен - Даут-Ата' : 'Актау - КПП Темир-Баба / Гарабогаз - Туркменбаши';
    return `Выбирайте маршрут ${routeName}. Сейчас контрольная точка ${best.name}: ${best.wait_minutes} мин ожидания, очередь ${best.current_queue} авто, загрузка ${loadPct(best)}%.`;
  }

  const action = best.wait_minutes < 60 ? 'можно ехать сейчас' : 'лучше выезжать позже, когда очередь спадет';
  return `По live-данным оптимально через ${best.name}. Очередь ${best.current_queue} авто, ожидание около ${best.wait_minutes} мин — ${action}.`;
}

export function DriverChatbot() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Message[]>([
    { role: 'bot', text: 'Привет! Спроси про любой КПП — скажу, где сейчас меньше очередь.' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, loading]);

  async function send(text?: string) {
    const q = text ?? input.trim();
    if (!q || loading) return;
    setInput('');
    setMsgs((items) => [...items, { role: 'user', text: q }]);
    setLoading(true);
    try {
      const data = await api.chatbot(q);
      setMsgs((items) => [...items, { role: 'bot', text: data.reply }]);
    } catch (err) {
      console.error(err);
      try {
        const checkpoints = await api.checkpoints();
        setMsgs((items) => [...items, { role: 'bot', text: localCheckpointReply(q, checkpoints) }]);
      } catch {
        setMsgs((items) => [
          ...items,
          {
            role: 'bot',
            text: 'Backend API недоступен. Если frontend и backend на разных доменах, добавьте VITE_API_URL с адресом backend и redeploy.',
          },
        ]);
      }
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-colors hover:bg-blue-700"
        title="Чат-бот водителя"
        aria-label="Открыть чат-бот водителя"
      >
        <MessageCircle size={24} aria-hidden />
      </button>
    );
  }

  return (
    <section className="fixed bottom-6 right-6 z-50 flex h-[420px] w-[calc(100vw-48px)] max-w-[20rem] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
      <div className="flex items-center justify-between gap-3 bg-blue-600 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Bot size={20} className="flex-shrink-0 text-white" aria-hidden />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">Помощник водителя</p>
            <p className="truncate text-xs text-blue-100">AI · данные КПП в реальном времени</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-blue-500 hover:text-white"
          aria-label="Закрыть чат"
        >
          <X size={18} aria-hidden />
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {msgs.map((message, index) => {
          const showSuggestions = message.role === 'bot' && index === msgs.length - 1 && !loading;
          return (
            <div key={`${message.role}-${index}`} className="space-y-2">
              <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                    message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {message.text}
                </div>
              </div>
              {showSuggestions && (
                <div className="flex flex-wrap gap-1.5 pl-1">
                  {QUICK.map((question) => (
                    <button
                      key={question}
                      type="button"
                      onClick={() => send(question)}
                      className="rounded-full border border-blue-200 bg-white px-2.5 py-1 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {loading && (
          <div className="flex justify-start">
            <div className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-500">
              <Loader2 className="spin" size={16} aria-hidden />
              Пишу ответ...
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex gap-2 border-t border-gray-100 p-3">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') send();
          }}
          placeholder="Спроси про КПП..."
          className="min-h-9 flex-1 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => send()}
          disabled={!input.trim() || loading}
          className="inline-flex min-h-9 w-10 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
          aria-label="Отправить сообщение"
        >
          <Send size={16} aria-hidden />
        </button>
      </div>
    </section>
  );
}
