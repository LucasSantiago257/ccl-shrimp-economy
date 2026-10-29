package br.com.camarao.trade;

import br.com.camarao.finance.FinanceService;
import br.com.camarao.report.ReportService;
import br.com.camarao.stock.StockOperations;
import jakarta.validation.Valid;
import java.security.Principal;
import java.time.LocalDate;
import java.util.Map;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/v1")
public class OperationsController {
    private final TradeService trade;
    private final FinanceService finance;
    private final StockOperations stock;
    private final ReportService reports;
    public OperationsController(TradeService trade,FinanceService finance,StockOperations stock,ReportService reports) {
        this.trade=trade;this.finance=finance;this.stock=stock;this.reports=reports;
    }
    @GetMapping("/sales") public Flux<Map<String,Object>> sales() { return trade.list(true); }
    @GetMapping("/purchases") public Flux<Map<String,Object>> purchases() { return trade.list(false); }
    @GetMapping("/sales/{id}/items") public Flux<Map<String,Object>> saleItems(@PathVariable long id) { return trade.items(true,id); }
    @GetMapping("/purchases/{id}/items") public Flux<Map<String,Object>> purchaseItems(@PathVariable long id) { return trade.items(false,id); }
    @PostMapping("/sales") public Mono<Map<String,Long>> sale(@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody TradeService.Trade body,Principal actor) {
        return trade.confirm(true,key,body,actor.getName());
    }
    @PostMapping("/purchases") public Mono<Map<String,Long>> purchase(@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody TradeService.Trade body,Principal actor) {
        return trade.confirm(false,key,body,actor.getName());
    }
    @GetMapping("/titles") public Flux<Map<String,Object>> titles(@RequestParam(defaultValue="RECEIVABLE") String nature,@RequestParam(defaultValue="0") long customerId,@RequestParam(defaultValue="false") boolean openOnly,@RequestParam(defaultValue="false") boolean purchasesOnly) { return finance.titles(nature,customerId,openOnly,purchasesOnly); }
    @GetMapping("/settlements") public Flux<Map<String,Object>> settlements(@RequestParam(defaultValue="0") long customerId) { return finance.settlements(customerId); }
    @PostMapping("/settlements") public Mono<Map<String,Long>> settlement(@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody FinanceService.Payment payment,Principal actor) {
        return finance.payment(key,payment,actor.getName());
    }
    @GetMapping("/expenses") public Flux<Map<String,Object>> expenses() { return finance.expenses(); }
    @PostMapping("/expenses") public Mono<Map<String,Long>> expense(@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody FinanceService.Expense expense,Principal actor) {
        return finance.expense(key,expense,actor.getName());
    }
    @GetMapping("/stock/movements") public Flux<Map<String,Object>> movements(@RequestParam(defaultValue="0") long productId) { return stock.movements(productId); }
    @PostMapping("/stock/losses") public Mono<Map<String,Long>> loss(@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody StockOperations.Loss loss,Principal actor) {
        return stock.loss(key,loss,actor.getName());
    }
    @GetMapping("/reports/result") public Mono<Map<String,Object>> report(@RequestParam LocalDate from,@RequestParam LocalDate to) { return reports.report(from,to); }
}
