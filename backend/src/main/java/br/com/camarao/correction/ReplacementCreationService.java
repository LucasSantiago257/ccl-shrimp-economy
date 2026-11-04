package br.com.camarao.correction;

import br.com.camarao.closing.*;
import br.com.camarao.shared.*;
import br.com.camarao.trade.TradeService;
import br.com.camarao.finance.FinanceService;
import br.com.camarao.stock.StockOperations;
import com.fasterxml.jackson.databind.*;
import jakarta.validation.Validator;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import reactor.core.publisher.Mono;

@Service
public class ReplacementCreationService {
    private final Sql sql;
    private final PeriodGuard periods;
    private final Idempotency idempotency;
    private final CorrectionService corrections;
    private final TradeService trades;
    private final FinanceService finance;
    private final StockOperations stock;
    private final ObjectMapper mapper;
    private final Validator validator;

    public ReplacementCreationService(Sql sql,PeriodGuard periods,Idempotency idempotency,CorrectionService corrections,
        TradeService trades,FinanceService finance,StockOperations stock,ObjectMapper mapper,Validator validator) {
        this.sql=sql;
        this.periods=periods;
        this.idempotency=idempotency;
        this.corrections=corrections;
        this.trades=trades;
        this.finance=finance;
        this.stock=stock;
        this.mapper=mapper;
        this.validator=validator;
    }

    @Transactional
    public Mono<Map<String,Long>> create(String key,long correctionId,JsonNode body,String actor) {
        return idempotency.run(key,"RECREATE",Map.of("correctionId",correctionId,"body",body),actor,() ->
            periods.requireOpenDay().then(sql.one("SELECT c.kind,r.source_id AS replacement_id FROM corrections c LEFT JOIN correction_replacements r ON r.correction_id=c.id WHERE c.id=:id",Map.of("id",correctionId))
                .switchIfEmpty(Mono.error(Rules.missing("Cancelamento não encontrado."))))
                .flatMap(correction -> {
                    if(correction.get("replacement_id")!=null) throw Rules.conflict("Este cancelamento já tem um registro correto vinculado.");
                    var kind=CorrectionService.Kind.valueOf((String)correction.get("kind"));
                    String createKey=ClosingService.sha256("create-replacement:"+key);
                    String linkKey=ClosingService.sha256("link-replacement:"+key);
                    return createPosting(kind,createKey,body,actor).flatMap(created ->
                        corrections.link(linkKey,correctionId,new CorrectionService.Replacement(created.get("id")),actor)
                            .thenReturn(created.get("id")));
                }));
    }

    private Mono<Map<String,Long>> createPosting(CorrectionService.Kind kind,String key,JsonNode body,String actor) {
        return switch(kind) {
            case SALE -> trades.confirm(true,key,decode(body,TradeService.Trade.class),actor);
            case PURCHASE -> trades.confirm(false,key,decode(body,TradeService.Trade.class),actor);
            case EXPENSE -> finance.expense(key,decode(body,FinanceService.Expense.class),actor);
            case PAYMENT -> finance.payment(key,decode(body,FinanceService.Payment.class),actor);
            case LOSS -> stock.loss(key,decode(body,StockOperations.Loss.class),actor);
        };
    }

    private <T> T decode(JsonNode body,Class<T> type) {
        try {
            T value=mapper.treeToValue(body,type);
            Rules.require(value!=null,"Preencha os dados do novo registro.");
            var errors=validator.validate(value);
            Rules.require(errors.isEmpty(),"Confira os campos do novo registro.");
            return value;
        } catch(com.fasterxml.jackson.core.JsonProcessingException e) {
            throw Rules.invalid("Os dados do novo registro são inválidos.");
        }
    }
}

