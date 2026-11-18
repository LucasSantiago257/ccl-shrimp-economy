package br.com.camarao.admin;

import java.sql.*;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="RESET_DB_TEST",matches="true")
class OperationalResetDatabaseTest {
    @Test void repeatedCleanupPreservesBothPartnerRegistries() throws Exception {
        String host="jdbc:mysql://127.0.0.1:13319/";
        String schema="reset_test_"+UUID.randomUUID().toString().replace("-","");
        String user=System.getenv("DB_USER"), password=System.getenv("DB_PASSWORD");
        try (var connection=DriverManager.getConnection(host,user,password); var sql=connection.createStatement()) {
            sql.execute("CREATE DATABASE "+schema);
            sql.execute("USE "+schema);
            Flyway.configure().dataSource(host+schema,user,password).load().migrate();
            sql.execute("INSERT INTO customers(name,phone,document,notes,active) VALUES('Cliente','123','456','Antigo',false)");
            sql.execute("INSERT INTO suppliers(name,phone,document,notes) VALUES('Fornecedor','321','654','Ativo')");
            sql.execute("INSERT INTO expenses(description,category,total,occurred_at,created_by) VALUES('Gelo','Outros',10,NOW(),'teste')");
            sql.execute("INSERT INTO fixed_expense_rules(description,category,amount,monthly_day,next_due,created_by) VALUES('Galpão','Aluguel',100,1,CURRENT_DATE,'teste')");
            var reset=new HomologationReset("homologation",true,host+schema,user,password);
            for(int attempt=0;attempt<2;attempt++) {
                reset.clear();
                assertEquals(1,count(sql,"customers WHERE id=1 AND name='Cliente' AND phone='123' AND document='456' AND notes='Antigo' AND active=false"));
                assertEquals(1,count(sql,"suppliers WHERE id=1 AND name='Fornecedor' AND phone='321' AND document='654' AND notes='Ativo' AND active=true"));
                assertEquals(0,count(sql,"expenses"));
                assertEquals(0,count(sql,"fixed_expense_rules"));
                assertEquals(1,count(sql,"stock_balances WHERE product_id=1 AND quantity=0"));
            }
        }
    }
    private int count(Statement sql,String condition) throws SQLException {
        try(var rows=sql.executeQuery("SELECT COUNT(*) FROM "+condition)) { rows.next();return rows.getInt(1); }
    }
}
