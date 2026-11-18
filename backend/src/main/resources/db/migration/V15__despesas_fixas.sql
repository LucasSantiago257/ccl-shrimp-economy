CREATE TABLE fixed_expense_rules (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    description VARCHAR(250) NOT NULL,
    category VARCHAR(80) NOT NULL,
    amount DECIMAL(19,2) NOT NULL CHECK (amount > 0),
    monthly_day INT NOT NULL CHECK (monthly_day BETWEEN 1 AND 31),
    next_due DATE NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by VARCHAR(100) NOT NULL,
    INDEX idx_fixed_due (active, next_due)
) ENGINE=InnoDB;

CREATE TABLE fixed_expense_occurrences (
    rule_id BIGINT NOT NULL,
    due_date DATE NOT NULL,
    expense_id BIGINT NOT NULL UNIQUE,
    PRIMARY KEY (rule_id, due_date),
    FOREIGN KEY (rule_id) REFERENCES fixed_expense_rules(id),
    FOREIGN KEY (expense_id) REFERENCES expenses(id)
) ENGINE=InnoDB;

CREATE VIEW classified_expenses AS
SELECT e.*, o.rule_id AS fixed_rule_id, IF(o.expense_id IS NULL, 'VARIABLE', 'FIXED') AS expense_kind
FROM expenses e LEFT JOIN fixed_expense_occurrences o ON o.expense_id=e.id;
