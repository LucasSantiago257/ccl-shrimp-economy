package br.com.camarao.finance;

import br.com.camarao.shared.*;
import java.math.BigDecimal;
import java.sql.*;
import java.time.*;
import java.util.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.*;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import reactor.core.publisher.Flux;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.when;

@EnabledIfEnvironmentVariable(named="FIXED_DB_TEST",matches="true")
@SpringBootTest(properties={"app.closing.scheduling-enabled=false","app.expenses.scheduling-enabled=false",
    "spring.r2dbc.url=r2dbc:mysql://127.0.0.1:13319/mare_fixed_test",
    "spring.flyway.url=jdbc:mysql://127.0.0.1:13319/mare_fixed_test?connectionTimeZone=UTC"})
@ContextConfiguration(initializers=FixedExpensesDatabaseTest.BeforeUpgrade.class)
class FixedExpensesDatabaseTest {
    static class BeforeUpgrade implements ApplicationContextInitializer<ConfigurableApplicationContext> {
        public void initialize(ConfigurableApplicationContext context) {
            String url=context.getEnvironment().getRequiredProperty("spring.flyway.url");
            String user=System.getenv("DB_USER"), password=System.getenv("DB_PASSWORD");
            Flyway.configure().dataSource(url,user,password).target("14").load().migrate();
            try(var conn=DriverManager.getConnection(url,user,password); var s=conn.createStatement()) {
                s.executeUpdate("INSERT INTO expenses(description,category,total,occurred_at,created_by) VALUES('Gelo antigo','Gelo',12.34,'2025-01-01 12:00:00','teste')");
            } catch(SQLException e) { throw new IllegalStateException(e); }
        }
    }

    @Autowired FixedExpenses rules;
    @Autowired FinanceService finance;
    @Autowired Sql sql;
    @MockitoBean Clock clock;
    private void date(LocalDate day) {
        when(clock.instant()).thenReturn(day.atTime(12,0).atZone(Rules.ZONE).toInstant());
    }
    private long count(String table) {
        return Sql.id(sql.one("SELECT COUNT(*) n FROM "+table,Map.of()).block(),"n");
    }

    @Test void upgradeAndGenerateMonthlyWithoutDoubleCharging() {
        var page=new PageQuery(1,20,"");
        var old=finance.expenses(page,"VARIABLE").block().items();
        assertThat(old).hasSize(1);
        assertThat(old.getFirst()).containsEntry("description","Gelo antigo").containsEntry("category","Gelo")
            .containsEntry("created_by","teste").containsEntry("occurred_at",LocalDateTime.of(2025,1,1,12,0));
        assertThat(Sql.decimal(old.getFirst(),"total")).isEqualByComparingTo("12.34");

        LocalDate january=LocalDate.of(2031,1,31);
        date(january);
        var rule=new FixedExpenses.Rule("Aluguel","Galpão",new BigDecimal("250.00"),january);
        String key=UUID.randomUUID().toString();
        long id=rules.create(key,rule,"teste").block().get("id");
        rules.create(key,rule,"teste").block();
        date(january.plusMonths(2));
        Flux.merge(rules.processNext(),rules.processNext()).collectList().block();
        rules.processNext().block();
        assertThat(sql.all("SELECT due_date FROM fixed_expense_occurrences ORDER BY due_date",Map.of())
            .map(r->r.get("due_date")).collectList().block()).containsExactly(january,january.plusMonths(1),january.plusMonths(2));
        assertThat(finance.expenses(page,"FIXED").block().items()).hasSize(3);
        assertThat(count("financial_titles")).isEqualTo(3);
        assertThat(count("settlements")).isZero();
        rules.stop(id).block();
        date(january.plusMonths(3));
        rules.processNext().block();
        assertThat(count("fixed_expense_occurrences")).isEqualTo(3);
        assertThat(finance.expenses(page,"VARIABLE").block().items()).isEqualTo(old);
    }
}
