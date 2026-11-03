package br.com.camarao.closing;

import br.com.camarao.finance.FinanceService;
import br.com.camarao.shared.Sql;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

// Opt-in only. Requires an EMPTY camarao_test database exposed on localhost:13307.
@EnabledIfEnvironmentVariable(named="AUTO_CLOSING_DB_TEST",matches="true")
@SpringBootTest(properties={"app.closing.scheduling-enabled=false","spring.r2dbc.url=r2dbc:mysql://127.0.0.1:13307/camarao_test","spring.flyway.url=jdbc:mysql://127.0.0.1:13307/camarao_test?connectionTimeZone=UTC"})
class AutomaticClosingDatabaseTest {
    @Autowired AutomaticClosingService automatic;
    @Autowired ClosingService closings;
    @Autowired FinanceService finance;
    @Autowired Sql sql;
    @MockitoBean Clock clock;
    private final AtomicReference<Instant> instant=new AtomicReference<>();
    private final LocalDate first=LocalDate.of(2030,4,1);
    private void at(int day,String time) { instant.set(first.plusDays(day).atTime(LocalTime.parse(time)).atZone(br.com.camarao.shared.Rules.ZONE).toInstant()); }
    private long count() { return Sql.id(sql.one("SELECT COUNT(*) total FROM period_closures",Map.of()).block(),"total"); }
    private LocalDate cursor() { return (LocalDate)sql.one("SELECT next_date FROM automatic_closing_state WHERE id=1",Map.of()).block().get("next_date"); }
    private Mono<Map<String,Long>> expense() { return finance.expense(UUID.randomUUID().toString(),new FinanceService.Expense("Teste automático","Teste",new BigDecimal("25.00"),BigDecimal.ZERO,"PIX",first.plusDays(30)),"test"); }
    @Test void dailyClosingIsAtomicResumableAndCompatibleWithManualClosing() {
        assertThat(count()).as("Use a fresh isolated database").isZero();
        when(clock.instant()).thenAnswer(ignored -> instant.get());
        at(0,"23:58:59.999999");
        expense().block();
        assertThat(automatic.closeNextDueDay().block()).isNull();
        assertThat(cursor()).isEqualTo(first);
        assertThat(closings.status().block().get("closed")).isEqualTo(false);

        at(0,"23:59:00");
        assertThat(closings.status().block()).containsEntry("closed",true).containsEntry("automaticClosingPending",true);
        assertThatThrownBy(() -> expense().block()).isInstanceOfSatisfying(ResponseStatusException.class,e -> assertThat(e.getStatusCode().value()).isEqualTo(409));
        var results=Flux.range(0,4).flatMap(i -> automatic.closeNextDueDay(),4).collectList().block();
        assertThat(results).hasSize(1); assertThat(count()).isEqualTo(1);
        long id=results.getFirst().closureId();
        String original=closings.json(id).block();
        assertThat(original).contains("Sistema (automático)","Teste automático","25.00");
        assertThat(closings.status().block()).containsEntry("closureId",id);
        assertThat(automatic.closeNextDueDay().block()).isNull();

        at(1,"12:00:00");
        expense().block();
        long manual=closings.close(UUID.randomUUID().toString(),new ClosingService.ClosePeriod(first.plusDays(1),first.plusDays(1),"Manual"),"test").block().get("id");
        String manualJson=closings.json(manual).block();
        at(1,"23:59:00");
        var skipped=automatic.closeNextDueDay().block();
        assertThat(skipped.created()).isFalse(); assertThat(skipped.closureId()).isEqualTo(manual);
        assertThat(closings.json(manual).block()).isEqualTo(manualJson);

        // Restart/catch-up path, including days with no activity. The same publisher is reused.
        var scheduled=new AutomaticClosingScheduler(automatic).closeDueDays();
        at(5,"12:00:00"); scheduled.block();
        assertThat(count()).isEqualTo(5); assertThat(cursor()).isEqualTo(first.plusDays(5));
        assertThat(closings.status().block().get("closed")).isEqualTo(false);
        at(5,"23:59:00"); scheduled.block(); scheduled.block();
        assertThat(count()).isEqualTo(6);

        // Fail AFTER snapshot insertion: snapshot and cursor must both roll back.
        at(6,"23:59:00");
        sql.update("CREATE TRIGGER automatic_closing_test_fail BEFORE UPDATE ON automatic_closing_state FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Forced test failure'",Map.of()).block();
        try { assertThatThrownBy(() -> automatic.closeNextDueDay().block()).hasMessageContaining("Forced test failure"); }
        finally { sql.update("DROP TRIGGER automatic_closing_test_fail",Map.of()).block(); }
        assertThat(count()).isEqualTo(6); assertThat(cursor()).isEqualTo(first.plusDays(6));
        scheduled.block(); assertThat(count()).isEqualTo(7);

        at(7,"23:59:00");
        var manualRace=closings.close(UUID.randomUUID().toString(),new ClosingService.ClosePeriod(first.plusDays(7),first.plusDays(7),"Concorrência"),"test")
            .onErrorResume(ResponseStatusException.class,e -> e.getStatusCode().value()==409 ? Mono.empty() : Mono.error(e));
        Flux.merge(manualRace,automatic.closeNextDueDay()).then().block();
        assertThat(count()).isEqualTo(8);
        assertThat(closings.json(id).block()).isEqualTo(original);
        assertThat(sql.one("SELECT snapshot_sha256 FROM period_closures WHERE id=:id",Map.of("id",id)).block().get("snapshot_sha256")).isEqualTo(ClosingService.sha256(original));
        assertThat(Sql.id(sql.one("SELECT COUNT(*) total FROM expenses",Map.of()).block(),"total")).isEqualTo(2);
    }
}
