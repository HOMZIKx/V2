-- Persist every non-zero item valuation from a drop as workspace price history.
-- This keeps the drop form simple while preserving who entered the price and when.

CREATE OR REPLACE FUNCTION player_team_capture_drop_item_price()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.item_id IS NOT NULL AND NEW.unit_price > 0 THEN
    INSERT INTO player_team_economy_prices
      (id, item_id, workspace_id, unit_price, currency, created_by, created_at)
    SELECT
      'drop_price_' || md5(
        NEW.id || ':' || s.workspace_id || ':' || clock_timestamp()::text || ':' || random()::text
      ),
      NEW.item_id,
      s.workspace_id,
      NEW.unit_price,
      NEW.currency,
      s.created_by,
      NOW()
    FROM player_team_drop_sessions s
    WHERE s.id = NEW.session_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_player_team_capture_drop_item_price ON player_team_drop_items;
CREATE TRIGGER trg_player_team_capture_drop_item_price
AFTER INSERT ON player_team_drop_items
FOR EACH ROW
EXECUTE FUNCTION player_team_capture_drop_item_price();
