CREATE TABLE opening_preferences (
 id TINYINT PRIMARY KEY,
 dismissed BOOLEAN NOT NULL DEFAULT FALSE,
 CHECK(id=1)
);
INSERT INTO opening_preferences(id) VALUES(1);
