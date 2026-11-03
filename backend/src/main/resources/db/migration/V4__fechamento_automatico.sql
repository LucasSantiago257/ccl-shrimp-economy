-- Cursor and snapshot commit together. NULL starts automation on its first operational day.
CREATE TABLE automatic_closing_state (
 id TINYINT PRIMARY KEY,
 next_date DATE NULL,
 CHECK (id=1)
) ENGINE=InnoDB;
INSERT INTO automatic_closing_state(id) VALUES(1);
