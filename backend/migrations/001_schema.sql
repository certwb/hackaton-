CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS checkpoints (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) CHECK (type IN ('land','sea','rail')),
  lat DECIMAL(9,6),
  lon DECIMAL(9,6),
  geom GEOGRAPHY(Point, 4326),
  capacity_per_hour INT DEFAULT 60,
  current_queue INT DEFAULT 0,
  wait_minutes INT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'open',
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shipments (
  id SERIAL PRIMARY KEY,
  tracking_number VARCHAR(20) UNIQUE,
  cargo_type VARCHAR(50),
  weight_tons DECIMAL(10,2),
  transport_mode VARCHAR(20) CHECK (transport_mode IN ('truck','rail','sea')),
  origin VARCHAR(100),
  destination VARCHAR(100),
  checkpoint_id INT REFERENCES checkpoints(id),
  status VARCHAR(30) DEFAULT 'in_transit',
  created_at TIMESTAMP DEFAULT NOW(),
  eta TIMESTAMP
);

CREATE TABLE IF NOT EXISTS port_metrics (
  id SERIAL PRIMARY KEY,
  recorded_date DATE NOT NULL,
  cargo_volume_tons DECIMAL(12,2),
  vessels_count INT,
  cargo_type VARCHAR(50),
  direction VARCHAR(10) CHECK (direction IN ('import','export','transit')),
  dest_country VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS carriers (
  id SERIAL PRIMARY KEY,
  company_name VARCHAR(200) NOT NULL,
  bin VARCHAR(12),
  trucks_count INT,
  specialization VARCHAR(50),
  rating DECIMAL(3,2) DEFAULT 4.0,
  phone VARCHAR(20),
  active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS freight_requests (
  id BIGSERIAL PRIMARY KEY,
  status VARCHAR(20) DEFAULT 'open',
  cargo_type VARCHAR(50),
  weight_tons DECIMAL(10,2),
  pickup_location VARCHAR(200),
  delivery_loc VARCHAR(200),
  desired_date DATE,
  budget_kzt DECIMAL(14,2),
  via_checkpoint VARCHAR(200),
  request JSONB DEFAULT '{}'::jsonb,
  recommended_route JSONB DEFAULT '{}'::jsonb,
  top_carriers JSONB DEFAULT '[]'::jsonb,
  carrier_id INT REFERENCES carriers(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deleted_routes (
  route_id TEXT PRIMARY KEY,
  deleted_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS checkpoint_load_log (
  id SERIAL PRIMARY KEY,
  checkpoint_id INT REFERENCES checkpoints(id),
  logged_at TIMESTAMP DEFAULT NOW(),
  queue_size INT,
  wait_minutes INT,
  trucks_passed INT
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_geom ON checkpoints USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_checkpoint_load_log_time ON checkpoint_load_log (checkpoint_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_freight_requests_created_at ON freight_requests (created_at DESC);
