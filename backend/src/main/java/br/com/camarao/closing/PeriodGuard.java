package br.com.camarao.closing;

import br.com.camarao.shared.*;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

@Component
public class PeriodGuard {
    private final Sql sql;
    public PeriodGuard(Sql sql) { this.sql=sql; }
    // Caller must own a transaction. Lock is retained until the entire command commits.
    public Mono<LocalDateTime> lock() {
        return sql.one("SELECT id FROM business_guard WHERE id=1 FOR UPDATE",Map.of())
            .switchIfEmpty(Mono.error(new IllegalStateException("Controle de períodos não inicializado.")))
            .map(ignored -> Rules.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS));
    }
    public Mono<LocalDateTime> requireOpenDay() {
        return lock().flatMap(now -> {
            var day=now.atOffset(ZoneOffset.UTC).atZoneSameInstant(Rules.ZONE).toLocalDate();
            return sql.one("SELECT id FROM period_closures WHERE date_from<=:day AND date_to>=:day LIMIT 1 FOR SHARE",Map.of("day",day))
                .flatMap(row -> Mono.<LocalDateTime>error(Rules.conflict("O dia "+day+" está fechado. Novos lançamentos ficam disponíveis no próximo dia aberto.")))
                .switchIfEmpty(Mono.just(now));
        });
    }
}
