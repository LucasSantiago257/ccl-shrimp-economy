package br.com.camarao.closing;

import br.com.camarao.shared.*;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.Clock;
import java.util.Map;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

@Component
public class PeriodGuard {
    private final Sql sql;
    private final Clock clock;
    public PeriodGuard(Sql sql,Clock clock) { this.sql=sql;this.clock=clock; }
    public LocalDateTime now() { return LocalDateTime.ofInstant(clock.instant(),ZoneOffset.UTC).truncatedTo(java.time.temporal.ChronoUnit.MICROS); }
    // Caller must own a transaction. Lock is retained until the entire command commits.
    public Mono<LocalDateTime> lock() {
        return sql.one("SELECT id FROM business_guard WHERE id=1 FOR UPDATE",Map.of())
            .switchIfEmpty(Mono.error(new IllegalStateException("Controle de períodos não inicializado.")))
            .map(ignored -> now());
    }
    public Mono<LocalDateTime> requireOpenDay() {
        return lock().flatMap(now -> {
            if(ClosingSchedule.reachedCutoff(now)) return Mono.error(Rules.conflict("O dia está encerrado para lançamentos. O fechamento automático ocorre às 23h59, no horário da Bahia. Novos lançamentos ficam disponíveis no próximo dia aberto."));
            var day=now.atOffset(ZoneOffset.UTC).atZoneSameInstant(Rules.ZONE).toLocalDate();
            return sql.one("SELECT id FROM period_closures WHERE date_from<=:day AND date_to>=:day LIMIT 1 FOR SHARE",Map.of("day",day))
                .flatMap(row -> Mono.<LocalDateTime>error(Rules.conflict("O dia "+day+" está fechado. Novos lançamentos ficam disponíveis no próximo dia aberto.")))
                .switchIfEmpty(Mono.just(now));
        });
    }
}
