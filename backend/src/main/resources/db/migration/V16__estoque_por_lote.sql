CREATE TABLE stock_lots (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 product_id BIGINT NOT NULL,
 origin VARCHAR(12) NOT NULL,
 origin_id BIGINT NOT NULL,
 received_at DATETIME(6) NOT NULL,
 suggested_price DECIMAL(19,6) NOT NULL,
 quantity DECIMAL(14,3) NOT NULL DEFAULT 0,
 stock_value DECIMAL(19,6) NOT NULL DEFAULT 0,
 UNIQUE(product_id,origin,origin_id),
 INDEX(product_id,received_at),
 FOREIGN KEY(product_id) REFERENCES products(id),
 CHECK(quantity>=0 AND stock_value>=0)
);
INSERT INTO stock_lots(product_id,origin,origin_id,received_at,suggested_price,quantity,stock_value)
SELECT b.product_id,'PREVIOUS',0,UTC_TIMESTAMP(6),p.suggested_price,b.quantity,b.stock_value
FROM stock_balances b JOIN products p ON p.id=b.product_id;

ALTER TABLE stock_movements ADD lot_id BIGINT NULL, ADD FOREIGN KEY(lot_id) REFERENCES stock_lots(id);
ALTER TABLE sale_items ADD INDEX idx_sale_document(sale_id,id);
ALTER TABLE sale_items DROP INDEX sale_id;

CREATE TRIGGER apply_lot_movement AFTER INSERT ON stock_movements FOR EACH ROW
 UPDATE stock_lots SET quantity=quantity+NEW.quantity_delta,stock_value=stock_value+NEW.value_delta WHERE id=NEW.lot_id;

CREATE TRIGGER reverse_lot_movement AFTER INSERT ON correction_stock FOR EACH ROW
 UPDATE stock_lots l JOIN stock_movements m ON m.id=NEW.movement_id AND l.product_id=m.product_id
 SET l.quantity=l.quantity-m.quantity_delta,l.stock_value=l.stock_value-m.value_delta
 WHERE l.id=m.lot_id OR (m.lot_id IS NULL AND l.origin='PREVIOUS');

CREATE TRIGGER add_opening_lot AFTER INSERT ON opening_stock FOR EACH ROW
 INSERT INTO stock_lots(product_id,origin,origin_id,received_at,suggested_price,quantity,stock_value)
 SELECT NEW.product_id,'OPENING',NEW.opening_id,b.occurred_at,p.suggested_price,NEW.quantity,NEW.total_cost
 FROM products p JOIN opening_balances b ON b.id=NEW.opening_id WHERE p.id=NEW.product_id;

CREATE TRIGGER reverse_opening_lot AFTER INSERT ON opening_reversals FOR EACH ROW
 UPDATE stock_lots l JOIN opening_stock s ON s.product_id=l.product_id AND s.opening_id=NEW.opening_id
 SET l.quantity=0,l.stock_value=0 WHERE (l.origin='OPENING' AND l.origin_id=NEW.opening_id) OR l.origin='PREVIOUS';
