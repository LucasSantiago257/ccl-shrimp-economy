package br.com.camarao.closing;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

@Component
@ConditionalOnProperty(name="app.closing.scheduling-enabled",havingValue="true",matchIfMissing=true)
public class AutomaticClosingScheduler {
    private static final Logger log=LoggerFactory.getLogger(AutomaticClosingScheduler.class);
    private final AutomaticClosingService service;
    public AutomaticClosingScheduler(AutomaticClosingService service) { this.service=service; }
    @Scheduled(cron="0 59 23 * * *",zone="America/Bahia")
    @Scheduled(fixedDelay=60000,initialDelay=0)
    public Mono<Void> closeDueDays() {
        // Spring re-subscribes to this publisher; time and DB state must be read afresh each time.
        return Mono.defer(service::closeNextDueDay).expand(ignored -> service.closeNextDueDay())
            .doOnNext(result -> { if(result.created()) log.info("Fechamento automático preservado: dia={}, snapshot={}",result.day(),result.closureId()); })
            .then().doOnError(error -> log.error("Falha no fechamento automático; nova tentativa na próxima verificação.",error));
    }
}
