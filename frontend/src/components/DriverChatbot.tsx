import { Bot, Loader2, MessageCircle, Send, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { Checkpoint } from '../types';

interface Message {
  role: 'user' | 'bot';
  text: string;
}

const QUICK = ['Какой КПП сейчас свободнее?', 'Сколько ждать на Карабогазе?', 'Когда лучше ехать сегодня?'];

function localCheckpointReply(checkpoints: Checkpoint[]) {
  const land = checkpoints.filter((checkpoint) => checkpoint.type === 'land');
  const candidates = land.length > 0 ? land : checkpoints;
  const best = [...candidates].sort((a, b) => a.wait_minutes - b.wait_minutes || a.current_queue - b.current_queue)[0];
  if (!best) {
    return 'API чата временно недоступен, и данные КПП не загрузились. Проверьте backend-деплой и переменную VITE_API_URL.';
  }
  const action = best.wait_minutes < 60 ? 'можно ехать сейчас' : 'лучше выезжать позже, когда очередь спадет';
  return `AI временно недоступен, показываю расчет по live-данным: оптимально через ${best.name}. Очередь ${best.current_queue} авто, ожидание около ${best.wait_minutes} мин — ${action}.`;
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
        setMsgs((items) => [...items, { role: 'bot', text: localCheckpointReply(checkpoints) }]);
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
        {msgs.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'
              }`}
            >
              {message.text}
            </div>
          </div>
        ))}
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

      {msgs.length <= 1 && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2">
          {QUICK.map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => send(question)}
              className="rounded-full border border-blue-200 px-2.5 py-1 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50"
            >
              {question}
            </button>
          ))}
        </div>
      )}

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
