package br.com.camarao.closing;

import br.com.camarao.shared.Sql;
import java.time.*;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class PeriodGuardTest {
    @Test void rejectsNewPostAtCutoffEvenBeforeSnapshotExists() {
        var sql=mock(Sql.class);
        when(sql.one(contains("business_guard"),anyMap())).thenReturn(Mono.just(Map.of("id",1)));
        var guard=new PeriodGuard(sql,Clock.fixed(Instant.parse("2026-11-04T02:59:00Z"),ZoneOffset.UTC));
        assertThatThrownBy(() -> guard.requireOpenDay().block()).isInstanceOfSatisfying(ResponseStatusException.class,e -> assertThat(e.getStatusCode().value()).isEqualTo(409));
        verify(sql,never()).one(contains("period_closures"),anyMap());
    }
    @Test void nextDayIsAvailableWithoutReopeningYesterday() {
        var sql=mock(Sql.class);
        when(sql.one(contains("business_guard"),anyMap())).thenReturn(Mono.just(Map.of("id",1)));
        when(sql.one(contains("period_closures"),anyMap())).thenReturn(Mono.empty());
        var guard=new PeriodGuard(sql,Clock.fixed(Instant.parse("2026-11-04T03:00:00Z"),ZoneOffset.UTC));
        assertThat(guard.requireOpenDay().block()).isEqualTo(LocalDateTime.parse("2026-11-04T03:00:00"));
    }
}
