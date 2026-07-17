-- ============================================================
-- HANGAR WORLD — CAMPEONATO FC26
-- Schema do Supabase (rode isso inteiro no SQL Editor do Supabase)
-- ============================================================

-- Extensão para gerar UUIDs
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Configurações gerais do campeonato (uma única linha, id fixo)
-- ------------------------------------------------------------
create table if not exists tournament_state (
  id                 int primary key default 1,
  phase              text not null default 'setup',        -- setup | groups | knockout | finished
  groups_drawn       boolean not null default false,
  knockout_generated boolean not null default false,
  third_place_generated boolean not null default false,
  tournament_started boolean not null default false,
  started_at         timestamptz,

  -- durações por fase, em minutos (tempo de jogo)
  group_game_min      int not null default 5,
  r16_game_min         int not null default 6,
  qf_game_min          int not null default 6,
  sf_game_min          int not null default 7,
  third_game_min        int not null default 7,
  final_game_min        int not null default 8,
  transition_min        int not null default 3,            -- tempo de preparação, igual em todas as fases
  stations              int not null default 2,             -- nº de PS5 simultâneos

  updated_at timestamptz not null default now(),

  constraint single_row check (id = 1)
);
insert into tournament_state (id) values (1) on conflict (id) do nothing;

-- ------------------------------------------------------------
-- Jogadores
-- ------------------------------------------------------------
create table if not exists players (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  group_letter text,                     -- 'A'..'H', definido no sorteio
  is_active    boolean not null default true,  -- false = foi substituído / saiu
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Lista de espera / substitutos
-- ------------------------------------------------------------
create table if not exists waitlist (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  used        boolean not null default false,
  used_for_player_id uuid references players(id),
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Partidas da fase de grupos
-- ------------------------------------------------------------
create table if not exists group_matches (
  id            uuid primary key default gen_random_uuid(),
  group_letter  text not null,
  p1            uuid references players(id),
  p2            uuid references players(id),
  score1        int,
  score2        int,
  status        text not null default 'waiting',  -- waiting | live | done
  wo            text,                              -- null | 'p1' | 'p2'
  station       int,                                -- 1 ou 2
  order_index   int not null,
  scheduled_time timestamptz,
  started_at     timestamptz,
  finished_at    timestamptz,
  created_at     timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Partidas do mata-mata (oitavas, quartas, semi, 3º lugar, final)
-- ------------------------------------------------------------
create table if not exists knockout_matches (
  id             uuid primary key default gen_random_uuid(),
  round          text not null,        -- r16 | qf | sf | third | final
  match_index    int not null,          -- posição dentro da rodada (0-based)
  p1             uuid references players(id),
  p2             uuid references players(id),
  score1         int,
  score2         int,
  status         text not null default 'waiting',
  wo             text,
  station        int,
  order_index    int,
  scheduled_time timestamptz,
  started_at     timestamptz,
  finished_at    timestamptz,
  next_round     text,                  -- para onde o vencedor avança
  next_match_index int,
  next_slot      text,                  -- 'p1' | 'p2'
  created_at     timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Row Level Security: leitura pública, escrita só via service role
-- (as rotas /api/admin/* usam a service role key no servidor)
-- ------------------------------------------------------------
alter table tournament_state  enable row level security;
alter table players           enable row level security;
alter table waitlist          enable row level security;
alter table group_matches     enable row level security;
alter table knockout_matches  enable row level security;

-- leitura liberada pra qualquer um (chave anônima) — é o que a página pública usa
create policy "public read tournament_state" on tournament_state for select using (true);
create policy "public read players"          on players          for select using (true);
create policy "public read group_matches"    on group_matches     for select using (true);
create policy "public read knockout_matches" on knockout_matches  for select using (true);
-- waitlist NÃO é liberada pra leitura pública (é informação só do organizador)

-- nenhuma policy de insert/update/delete é criada para a chave anônima,
-- então só a service role key (usada nas funções serverless /api/admin/*) pode escrever.

-- ------------------------------------------------------------
-- Habilitar Realtime nessas tabelas (Database > Replication no painel do Supabase
-- também precisa estar habilitado para elas, ou rode:)
-- ------------------------------------------------------------
alter publication supabase_realtime add table tournament_state;
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table group_matches;
alter publication supabase_realtime add table knockout_matches;

-- REPLICA IDENTITY FULL: sem isso, o Realtime só manda a chave primária no
-- campo "old" de um UPDATE. Precisamos do placar/status antigos completos
-- para detectar "saiu gol" e "partida terminou" no front-end.
alter table tournament_state  replica identity full;
alter table group_matches     replica identity full;
alter table knockout_matches  replica identity full;
