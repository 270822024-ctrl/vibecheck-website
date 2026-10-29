import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from app.config import Settings
from app.db import Database, POSTGRES_SCHEMA


class FakeCursor:
    def __init__(self, statements):
        self.statements = statements

    def execute(self, sql, params=()):
        self.statements.append((sql, params))
        return self


class FakeConnection:
    def __init__(self):
        self.statements = []

    def cursor(self):
        return FakeCursor(self.statements)

    def commit(self):
        pass

    def rollback(self):
        pass

    def close(self):
        pass


class PostgresDatabaseTests(unittest.TestCase):
    def _settings(self, **overrides):
        values = {
            "db_engine": "postgresql",
            "db_path": Path("data/vibecheck.db"),
            "db_host": "localhost",
            "db_port": 5432,
            "db_name": "vibecheck",
            "db_user": "vibecheck_user",
            "db_password": "",
            "db_url": "postgresql://user:password@localhost/vibecheck",
        }
        values.update(overrides)
        return types.SimpleNamespace(**values)

    def test_creates_schema_and_uses_ssl_url(self):
        raw_connections = [FakeConnection(), FakeConnection()]
        connect = Mock(side_effect=raw_connections)
        driver = types.ModuleType("psycopg")
        driver.connect = connect

        with patch.dict(sys.modules, {"psycopg": driver}):
            db = Database(self._settings())
            with db.connect() as conn:
                conn.execute("SELECT id FROM users WHERE id = ?", ("user-id",))

        self.assertEqual(len(raw_connections[0].statements), len(POSTGRES_SCHEMA))
        self.assertEqual(
            raw_connections[1].statements,
            [("SELECT id FROM users WHERE id = %s", ("user-id",))],
        )
        self.assertEqual(
            connect.call_args_list[0].args,
            ("postgresql://user:password@localhost/vibecheck",),
        )
        self.assertEqual(connect.call_args_list[0].kwargs, {"sslmode": "require"})

    def test_postgres_requires_url_or_password(self):
        with self.assertRaisesRegex(RuntimeError, "VIBECHECK_DATABASE_URL"):
            Database(self._settings(db_url="", db_password=""))

    def test_postgres_default_port(self):
        with patch.dict(os.environ, {"VIBECHECK_DB_ENGINE": "postgresql"}, clear=True):
            self.assertEqual(Settings().db_port, 5432)
