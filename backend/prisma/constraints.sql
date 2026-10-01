-- Applied after `prisma db push`. Financial integrity enforced by the database itself.
ALTER TABLE "Wallet" DROP CONSTRAINT IF EXISTS wallet_balance_nonneg;
ALTER TABLE "Wallet" ADD CONSTRAINT wallet_balance_nonneg CHECK (balance >= 0);
ALTER TABLE "Wallet" DROP CONSTRAINT IF EXISTS wallet_balance_consistent;
ALTER TABLE "Wallet" ADD CONSTRAINT wallet_balance_consistent CHECK (balance = "totalEarned" - "totalSpent");
ALTER TABLE "WalletTransaction" DROP CONSTRAINT IF EXISTS wallet_tx_amount_nonzero;
ALTER TABLE "WalletTransaction" ADD CONSTRAINT wallet_tx_amount_nonzero CHECK (amount <> 0);
ALTER TABLE "WalletTransaction" DROP CONSTRAINT IF EXISTS wallet_tx_balance_nonneg;
ALTER TABLE "WalletTransaction" ADD CONSTRAINT wallet_tx_balance_nonneg CHECK ("balanceAfter" >= 0);

CREATE OR REPLACE FUNCTION wallet_tx_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'wallet transactions are immutable';
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS wallet_tx_no_update ON "WalletTransaction";
CREATE TRIGGER wallet_tx_no_update BEFORE UPDATE OR DELETE ON "WalletTransaction"
  FOR EACH ROW EXECUTE FUNCTION wallet_tx_immutable();
