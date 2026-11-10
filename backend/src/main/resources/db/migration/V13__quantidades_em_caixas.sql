ALTER TABLE products ADD COLUMN box_weight_kg DECIMAL(9,3) NOT NULL DEFAULT 15,
 ADD CONSTRAINT ck_product_box_weight CHECK(box_weight_kg>0);
ALTER TABLE purchase_items ADD COLUMN box_count DECIMAL(14,3) NULL,
 ADD COLUMN box_weight_kg DECIMAL(9,3) NULL,
 ADD CONSTRAINT ck_purchase_boxes CHECK((box_count IS NULL AND box_weight_kg IS NULL) OR
 (box_count IS NOT NULL AND box_weight_kg IS NOT NULL AND box_count>0 AND box_weight_kg>0 AND quantity=box_count*box_weight_kg));
ALTER TABLE sale_items ADD COLUMN box_count DECIMAL(14,3) NULL,
 ADD COLUMN box_weight_kg DECIMAL(9,3) NULL,
 ADD CONSTRAINT ck_sale_boxes CHECK((box_count IS NULL AND box_weight_kg IS NULL) OR
 (box_count IS NOT NULL AND box_weight_kg IS NOT NULL AND box_count>0 AND box_weight_kg>0 AND quantity=box_count*box_weight_kg));
