package br.com.camarao.stock;

import br.com.camarao.closing.PeriodGuard;
import br.com.camarao.shared.*;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import reactor.core.publisher.Mono;

@Service
public class ProcessingService {
    public record Request(@Positive long sourceProductId, @Positive long targetProductId,
        @NotNull @DecimalMin("0.001") @Digits(integer=10,fraction=3) BigDecimal inputKg,
        @NotNull @DecimalMin("0.001") @Digits(integer=10,fraction=3) BigDecimal outputKg, @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL) @Positive Long lotId) { public Request(long s,long t,BigDecimal i,BigDecimal o){this(s,t,i,o,null);} }

    private final Sql sql;
    private final PeriodGuard periods;
    private final StockService stock;
    private final Idempotency idempotency;

    public ProcessingService(Sql sql, PeriodGuard periods, StockService stock, Idempotency idempotency) {
        this.sql=sql;
        this.periods=periods;
        this.stock=stock;
        this.idempotency=idempotency;
    }

    @Transactional
    public Mono<Map<String,Long>> create(String key, Request body, String actor) {
        Rules.require(body.sourceProductId()!=body.targetProductId(),"Escolha produtos diferentes para origem e resultado.");
        Rules.require(body.outputKg().compareTo(body.inputKg())<=0,"O peso obtido não pode exceder o peso consumido.");
        return idempotency.run(key,"PROCESS",body,actor,() -> periods.requireOpenDay()
            .flatMap(now -> stock.consume(body.sourceProductId(),body.inputKg(),body.lotId()).flatMap(consumed -> {
                BigDecimal cost=consumed.totalCost();
                return stock.receive(body.targetProductId(),body.outputKg(),cost)
                    .then(sql.insert("""
                        INSERT INTO processing_batches(source_product_id,target_product_id,input_kg,output_kg,transferred_cost,occurred_at,created_by)
                        VALUES(:source,:target,:input,:output,:cost,:at,:actor)
                        """,Map.of("source",body.sourceProductId(),"target",body.targetProductId(),"input",body.inputKg(),
                            "output",body.outputKg(),"cost",cost,"at",now,"actor",actor)))
                    .flatMap(id -> movement(id,body.sourceProductId(),body.inputKg().negate(),cost.negate(),consumed.lotId(),now,actor)
                        .then(stock.createLot(body.targetProductId(),"PROCESS",id,now,null).flatMap(lot -> movement(id,body.targetProductId(),body.outputKg(),cost,lot,now,actor))).thenReturn(id));
            })));
    }

    private Mono<Long> movement(long id,long product,BigDecimal kg,BigDecimal cost,long lot,LocalDateTime now,String actor) {
        return sql.insert("""
            INSERT INTO stock_movements(product_id,type,quantity_delta,value_delta,processing_id,lot_id,reason,occurred_at,created_by)
            VALUES(:product,'PROCESS',:kg,:cost,:id,:lot,:reason,:at,:actor)
            """,Map.of("product",product,"kg",kg,"cost",cost,"id",id,"lot",lot,"reason","Beneficiamento #"+id,"at",now,"actor",actor));
    }

    public Mono<PageResult> list(PageQuery page) {
        return sql.page("""
            SELECT b.*,s.name AS source_name,t.name AS target_name,l.origin AS lot_origin,l.origin_id AS lot_document,c.id AS correction_id
            FROM processing_batches b JOIN products s ON s.id=b.source_product_id
            JOIN products t ON t.id=b.target_product_id
            LEFT JOIN stock_movements m ON m.processing_id=b.id AND m.product_id=b.source_product_id
            LEFT JOIN stock_lots l ON l.id=m.lot_id
            LEFT JOIN corrections c ON c.kind='PROCESS' AND c.source_id=b.id
            WHERE s.name LIKE :q ESCAPE '!' OR t.name LIKE :q ESCAPE '!'
            ""","b.id DESC",Map.of("q",page.like()),page);
    }
}
