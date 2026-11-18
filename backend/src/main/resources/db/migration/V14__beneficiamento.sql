CREATE TABLE processing_batches (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 source_product_id BIGINT NOT NULL,
 target_product_id BIGINT NOT NULL,
 input_kg DECIMAL(14,3) NOT NULL,
 output_kg DECIMAL(14,3) NOT NULL,
 transferred_cost DECIMAL(19,6) NOT NULL,
 occurred_at DATETIME(6) NOT NULL,
 created_by VARCHAR(100) NOT NULL,
 CHECK(source_product_id<>target_product_id),
 CHECK(output_kg>0 AND output_kg<=input_kg AND transferred_cost>=0),
 FOREIGN KEY(source_product_id) REFERENCES products(id),
 FOREIGN KEY(target_product_id) REFERENCES products(id),
 INDEX idx_processing_date(occurred_at)
);
ALTER TABLE stock_movements
 ADD COLUMN processing_id BIGINT NULL,
 ADD FOREIGN KEY(processing_id) REFERENCES processing_batches(id),
 ADD UNIQUE(processing_id,product_id),
 DROP CHECK stock_movements_chk_1,
 ADD CONSTRAINT ck_stock_movement_origin CHECK (
  (processing_id IS NULL AND (
   (type='PURCHASE' AND quantity_delta>0 AND value_delta>0 AND purchase_item_id IS NOT NULL AND sale_item_id IS NULL)
   OR (type='SALE' AND quantity_delta<0 AND value_delta<=0 AND sale_item_id IS NOT NULL AND purchase_item_id IS NULL)
   OR (type='LOSS' AND quantity_delta<0 AND value_delta<=0 AND purchase_item_id IS NULL AND sale_item_id IS NULL AND reason<>'')
  )) OR (type='PROCESS' AND processing_id IS NOT NULL AND purchase_item_id IS NULL AND sale_item_id IS NULL
         AND quantity_delta<>0 AND quantity_delta*value_delta>=0)
 );
ALTER TABLE corrections DROP CHECK corrections_chk_1,
 ADD CONSTRAINT ck_correction_kind CHECK(kind IN ('SALE','PURCHASE','EXPENSE','PAYMENT','LOSS','PROCESS'));
