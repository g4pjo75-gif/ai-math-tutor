-- server/migrations/0003_usage_cost.sql — usage 테이블에 모델, thinkingLevel, 원가 추가
ALTER TABLE usage ADD COLUMN model TEXT;
ALTER TABLE usage ADD COLUMN thinking_level TEXT;
ALTER TABLE usage ADD COLUMN cost_micro_yen INTEGER DEFAULT 0;
