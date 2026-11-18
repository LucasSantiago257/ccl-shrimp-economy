package br.com.camarao.finance;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

@Component
@ConditionalOnProperty(name="app.expenses.scheduling-enabled", havingValue="true", matchIfMissing=true)
public class FixedExpenseScheduler {
    private final FixedExpenses rules;
    public FixedExpenseScheduler(FixedExpenses rules) { this.rules=rules; }

    @Scheduled(fixedDelay=60000)
    public Mono<Void> generateDueExpenses() {
        return Mono.defer(rules::processNext).expand(done -> rules.processNext()).then();
    }
}
