package br.com.camarao.closing;

import br.com.camarao.shared.Sql;
import java.time.LocalDate;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import reactor.core.publisher.Mono;

@Service
public class AutomaticClosingService {
    public static final String ACTOR = "Sistema (automático)";
    public record Result(LocalDate day,long closureId,boolean created) {}
    private final Sql sql;
    private final PeriodGuard periods;
    private final ClosingService closings;
    public AutomaticClosingService(Sql sql,PeriodGuard periods,ClosingService closings) { this.sql=sql;this.periods=periods;this.closings=closings; }
    // One day per transaction: safe to retry, resume after restart and run on multiple instances.
    @Transactional
    public Mono<Result> closeNextDueDay() {
        return periods.lock().flatMap(now -> sql.one("SELECT next_date FROM automatic_closing_state WHERE id=1 FOR UPDATE",Map.of())
            .switchIfEmpty(Mono.error(new IllegalStateException("Controle do fechamento automático não inicializado.")))
            .flatMap(state -> {
                LocalDate day=state.get("next_date")==null ? ClosingSchedule.day(now) : (LocalDate)state.get("next_date");
                Mono<Long> initialize=state.get("next_date")==null ? advance(day) : Mono.just(0L);
                return initialize.then(Mono.defer(() -> {
                    if(day.isAfter(ClosingSchedule.dueThrough(now))) return Mono.empty();
                    return sql.one("SELECT id,date_to FROM period_closures WHERE date_from<=:day AND date_to>=:day LIMIT 1 FOR SHARE",Map.of("day",day))
                        .flatMap(existing -> advance(((LocalDate)existing.get("date_to")).plusDays(1)).thenReturn(new Result(day,Sql.id(existing,"id"),false)))
                        .switchIfEmpty(Mono.defer(() -> closings.capture(new ClosingService.ClosePeriod(day,day,"Fechamento diário automático às 23h59 (America/Bahia)."),ACTOR,now)
                            .flatMap(id -> advance(day.plusDays(1)).thenReturn(new Result(day,id,true)))));
                }));
            }));
    }
    private Mono<Long> advance(LocalDate next) { return sql.update("UPDATE automatic_closing_state SET next_date=:next WHERE id=1",Map.of("next",next)); }
}
