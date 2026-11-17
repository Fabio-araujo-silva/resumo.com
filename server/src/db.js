// Banco SQLite (node:sqlite, sem dependência nativa). Tudo o que a plataforma sabe fica aqui, menos
// os arquivos binários (imagens e PDFs), que ficam em DATA_DIR/anexos/<materia>/.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const MIGRACOES = [
  `create table users (
     id text primary key,
     email text not null unique,
     nome text not null,
     senha_hash text not null,
     papel text not null default 'aluno',
     ativo integer not null default 1,
     expira_em integer,
     acesso_total integer not null default 1,
     criado_em integer not null,
     ultimo_acesso integer
   );
   create table user_materias (
     user_id text not null references users(id) on delete cascade,
     materia_id text not null,
     primary key (user_id, materia_id)
   );
   create table sessoes (
     token_hash text primary key,
     user_id text not null references users(id) on delete cascade,
     criado_em integer not null,
     expira_em integer not null,
     ip text,
     ua text
   );
   create index sessoes_user on sessoes(user_id);
   create table tokens_api (
     id text primary key,
     nome text not null,
     token_hash text not null unique,
     user_id text not null references users(id) on delete cascade,
     criado_em integer not null,
     ultimo_uso integer
   );

   create table materias (
     id text primary key,
     nome text not null,
     semestre integer not null,
     eixo text not null default '',
     descricao text not null default '',
     cor text not null default '',
     prova_data text,
     prova_foco text not null default '',
     criado_em integer not null,
     atualizado_em integer not null
   );
   create table modulos (
     id text primary key,
     materia_id text not null references materias(id) on delete cascade,
     slug text not null,
     titulo text not null,
     descricao text not null default '',
     ordem integer not null default 0
   );
   create index modulos_materia on modulos(materia_id);
   create table notas (
     id text primary key,
     materia_id text not null references materias(id) on delete cascade,
     modulo_id text not null references modulos(id) on delete cascade,
     slug text not null,
     titulo text not null,
     resumo text not null default '',
     md text not null default '',
     texto text not null default '',
     prova integer not null default 0,
     prioridade integer not null default 2,
     tags text not null default '[]',
     fontes text not null default '[]',
     ordem integer not null default 0,
     minutos integer not null default 1,
     pdf text,
     publicada integer not null default 1,
     criado_em integer not null,
     atualizado_em integer not null
   );
   create index notas_materia on notas(materia_id);
   create index notas_modulo on notas(modulo_id);
   create table links (
     origem text not null references notas(id) on delete cascade,
     destino text not null references notas(id) on delete cascade,
     primary key (origem, destino)
   );
   create index links_destino on links(destino);
   create table anexos (
     materia_id text not null references materias(id) on delete cascade,
     caminho text not null,
     mime text not null,
     tamanho integer not null,
     primary key (materia_id, caminho)
   );

   create table flashcards (
     id text primary key,
     materia_id text not null references materias(id) on delete cascade,
     nota_id text not null references notas(id) on delete cascade,
     frente text not null,
     verso text not null,
     ordem integer not null default 0
   );
   create index flashcards_materia on flashcards(materia_id);
   create index flashcards_nota on flashcards(nota_id);
   create table estados_card (
     user_id text not null references users(id) on delete cascade,
     card_id text not null references flashcards(id) on delete cascade,
     estado text not null,
     passo integer not null default 0,
     vence integer not null,
     intervalo integer not null default 0,
     facilidade real not null default 2.5,
     reps integer not null default 0,
     lapsos integer not null default 0,
     atualizado_em integer not null,
     primary key (user_id, card_id)
   );
   create index estados_vence on estados_card(user_id, vence);
   create table revisoes (
     id integer primary key autoincrement,
     user_id text not null references users(id) on delete cascade,
     card_id text not null,
     materia_id text not null,
     resposta integer not null,
     estado_antes text not null,
     intervalo integer not null,
     facilidade real not null,
     em integer not null
   );
   create index revisoes_user on revisoes(user_id, em);

   create table leituras (
     user_id text not null references users(id) on delete cascade,
     nota_id text not null references notas(id) on delete cascade,
     lida_em integer not null,
     primary key (user_id, nota_id)
   );
   create table acessos (
     id integer primary key autoincrement,
     user_id text not null references users(id) on delete cascade,
     nota_id text not null,
     tipo text not null default 'nota',
     em integer not null,
     ip text
   );
   create index acessos_user on acessos(user_id, em);
   create index acessos_em on acessos(em);

   create table geracoes (
     id text primary key,
     materia_id text not null,
     status text not null,
     pedido text not null,
     log text not null default '',
     resultado text,
     criado_em integer not null,
     terminou_em integer
   );`,
];

export function abrirDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, "sinapse.db"));
  db.exec("pragma journal_mode = wal; pragma foreign_keys = on; pragma busy_timeout = 5000;");
  db.exec("create table if not exists schema_version (version integer not null)");
  const row = db.prepare("select version from schema_version").get();
  let versao = row ? row.version : 0;
  if (!row) db.prepare("insert into schema_version (version) values (0)").run();
  for (; versao < MIGRACOES.length; versao++) {
    db.exec("begin");
    try {
      db.exec(MIGRACOES[versao]);
      db.prepare("update schema_version set version = ?").run(versao + 1);
      db.exec("commit");
    } catch (e) {
      db.exec("rollback");
      throw e;
    }
  }
  return db;
}

// Roda fn dentro de uma transação; desfaz tudo se ela lançar.
export function transacao(db, fn) {
  db.exec("begin immediate");
  try {
    const r = fn();
    db.exec("commit");
    return r;
  } catch (e) {
    db.exec("rollback");
    throw e;
  }
}
