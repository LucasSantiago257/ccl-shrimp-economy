CREATE TABLE allocation_reversals (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 correction_id BIGINT NOT NULL,
 settlement_id BIGINT NOT NULL,
 title_id BIGINT NOT NULL,
 amount DECIMAL(19,2) NOT NULL,
 UNIQUE(settlement_id,title_id),
 FOREIGN KEY(correction_id) REFERENCES corrections(id),
 FOREIGN KEY(settlement_id,title_id) REFERENCES settlement_allocations(settlement_id,title_id),
 CHECK(amount>0)
) ENGINE=InnoDB;
CREATE TRIGGER allocation_reversals_no_update BEFORE UPDATE ON allocation_reversals FOR EACH ROW
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Estornos financeiros sao imutaveis';
CREATE TRIGGER allocation_reversals_no_delete BEFORE DELETE ON allocation_reversals FOR EACH ROW
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Estornos financeiros sao imutaveis';

-- A document reverses only its allocation, even when the payment covers other titles.
-- A later cancellation of the payment reverses only its remaining allocations.
CREATE OR REPLACE VIEW allocation_events AS
 SELECT a.*,s.occurred_at,NULL AS correction_id FROM settlement_allocations a JOIN settlements s ON s.id=a.settlement_id
 UNION ALL
 SELECT a.settlement_id,a.title_id,-(a.amount-COALESCE(r.amount,0)),c.occurred_at,c.id
 FROM corrections c JOIN settlement_allocations a ON c.kind='PAYMENT' AND c.source_id=a.settlement_id
 LEFT JOIN allocation_reversals r ON r.settlement_id=a.settlement_id AND r.title_id=a.title_id
 WHERE a.amount>COALESCE(r.amount,0)
 UNION ALL
 SELECT r.settlement_id,r.title_id,-r.amount,c.occurred_at,c.id
 FROM allocation_reversals r JOIN corrections c ON c.id=r.correction_id;

CREATE OR REPLACE VIEW settlement_events AS
 SELECT id,direction,amount,occurred_at FROM settlements
 UNION ALL
 SELECT -c.id,s.direction,-(s.amount-COALESCE(r.amount,0)),c.occurred_at
 FROM corrections c JOIN settlements s ON c.kind='PAYMENT' AND c.source_id=s.id
 LEFT JOIN (SELECT settlement_id,SUM(amount) amount FROM allocation_reversals GROUP BY settlement_id) r ON r.settlement_id=s.id
 WHERE s.amount>COALESCE(r.amount,0)
 UNION ALL
 SELECT -c.id,s.direction,-SUM(r.amount),c.occurred_at
 FROM allocation_reversals r JOIN corrections c ON c.id=r.correction_id JOIN settlements s ON s.id=r.settlement_id
 GROUP BY c.id,s.id;
