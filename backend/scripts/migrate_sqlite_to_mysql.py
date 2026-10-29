"""Copy local SQLite account and analysis data into an empty MySQL database."""

from __future__ import annotations

import sqlite3

from app.config import get_settings
from app.db import Database

TABLE_COLUMNS = {
    "users": ("id", "email", "password_hash", "created_at"),
    "sessions": ("token_hash", "user_id", "created_at", "expires_at"),
    "reset_tokens": ("token_hash", "user_id", "expires_at"),
    "analyses": ("id", "user_id", "created_at", "payload"),
}


def main() -> None:
    settings = get_settings()
    if settings.db_engine != "mysql":
        raise RuntimeError("Defina VIBECHECK_DB_ENGINE=mysql antes de migrar.")
    if not settings.db_path.is_file():
        raise FileNotFoundError(f"Banco SQLite não encontrado: {settings.db_path}")

    with sqlite3.connect(settings.db_path) as source:
        rows = {
            table: source.execute(
                f"SELECT {', '.join(columns)} FROM {table}"
            ).fetchall()
            for table, columns in TABLE_COLUMNS.items()
        }

    database = Database(settings)
    with database.connect() as destination:
        nonempty = [
            table
            for table in TABLE_COLUMNS
            if destination.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        ]
        if nonempty:
            raise RuntimeError(
                "Migração cancelada: as tabelas MySQL já contêm dados: "
                + ", ".join(nonempty)
                + ". A origem SQLite foi mantida intacta."
            )

        for table, columns in TABLE_COLUMNS.items():
            column_list = ", ".join(columns)
            placeholders = ", ".join("?" for _ in columns)
            statement = f"INSERT INTO {table} ({column_list}) VALUES ({placeholders})"
            for row in rows[table]:
                destination.execute(statement, row)

    for table, table_rows in rows.items():
        print(f"{table}: {len(table_rows)} registro(s) migrado(s)")
    print("Migração concluída. O banco SQLite original não foi alterado.")


if __name__ == "__main__":
    main()
