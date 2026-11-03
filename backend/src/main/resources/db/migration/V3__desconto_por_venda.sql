ALTER TABLE sales
 ADD COLUMN gross_total DECIMAL(19,2) NOT NULL DEFAULT 0,
 ADD COLUMN discount_amount DECIMAL(19,2) NOT NULL DEFAULT 0;

-- Existing documents keep their original total and financial obligations.
UPDATE sales SET gross_total=total;
ALTER TABLE sales DROP CHECK sales_chk_1;
ALTER TABLE sales ADD CONSTRAINT ck_sales_document_amounts CHECK (
 gross_total>0 AND discount_amount>=0 AND discount_amount<=gross_total
 AND total=gross_total-discount_amount AND total>=0
);
