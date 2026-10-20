-- Runs once when the postgres volume is first initialised.
-- A separate database keeps integration tests away from development data.
CREATE DATABASE frealgo_test OWNER frealgo;
