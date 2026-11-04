package br.com.camarao.correction;

import br.com.camarao.catalog.CatalogService;
import br.com.camarao.closing.ClosingService;
import br.com.camarao.finance.FinanceService;
import br.com.camarao.report.*;
import br.com.camarao.shared.*;
import br.com.camarao.stock.StockOperations;
import br.com.camarao.trade.TradeService;
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

@EnabledIfEnvironmentVariable(named="CORRECTION_DB_TEST",matches="true")
@SpringBootTest(properties={"app.closing.scheduling-enabled=false","spring.r2dbc.url=r2dbc:mysql://127.0.0.1:13307/camarao_test","spring.flyway.url=jdbc:mysql://127.0.0.1:13307/camarao_test?connectionTimeZone=UTC"})
class CorrectionDatabaseTest {
    @Autowired CorrectionService corrections;
    @Autowired TradeService trades;
    @Autowired FinanceService finance;
    @Autowired CatalogService catalog;
    @Autowired StockOperations stock;
    @Autowired ClosingService closings;
    @Autowired ReportService reports;
    @Autowired DashboardService dashboard;
    @Autowired Sql sql;
    @MockitoBean Clock clock;
    private final AtomicReference<Instant> instant=new AtomicReference<>();
    private final LocalDate first=LocalDate.of(2031,5,10);
    private static BigDecimal amount(String value) { return new BigDecimal(value); }
    private static String key() { return UUID.randomUUID().toString(); }
    private void at(int day,String time) { instant.set(first.plusDays(day).atTime(LocalTime.parse(time)).atZone(Rules.ZONE).toInstant()); }
    private Mono<Map<String,Long>> cancel(CorrectionService.Kind kind,long id) {
        return corrections.cancel(key(),kind,id,new CorrectionService.Request("Registro de teste incorreto"),"test");
    }
    private Mono<Map<String,Long>> expense(String value) {
        return finance.expense(key(),new FinanceService.Expense("Despesa de correção","Teste",amount(value),BigDecimal.ZERO,"PIX",first.plusDays(30)),"test");
    }
    private void number(Map<String,Object> row,String field,String expected) {
        assertThat(Sql.decimal(row,field)).as(field).isEqualByComparingTo(expected);
    }
    @SuppressWarnings("unchecked")
    private Map<String,Object> metrics(LocalDate from,LocalDate to) {
        return (Map<String,Object>)reports.report(from,to).block().get("metrics");
    }
    private long countCorrections() { return Sql.id(sql.one("SELECT COUNT(*) total FROM corrections",Map.of()).block(),"total"); }

    @Test void reversalsAreDatedAtomicHistoricalAndAuditable() {
        assertThat(countCorrections()).isZero();
        when(clock.instant()).thenAnswer(ignored -> instant.get());
        at(0,"12:00:00");
        long product=catalog.createProduct(new CatalogService.Product("REV-QA","Camarão correção",amount("50"),BigDecimal.ZERO,true)).block().get("id");
        long customer=catalog.createPartner(true,new CatalogService.Partner("Cliente correção","","","",true)).block().get("id");
        var purchaseBody=new TradeService.Trade(null,List.of(new TradeService.Item(product,amount("20"),amount("30"))),amount("200"),"PIX",first,false,null);
        long purchase=trades.confirm(false,key(),purchaseBody,"test").block().get("id");
        var saleBody=new TradeService.Trade(customer,List.of(new TradeService.Item(product,amount("5"),amount("50"))),amount("40"),"PIX",first,false,amount("10"));
        long sale=trades.confirm(true,key(),saleBody,"test").block().get("id");
        long loss=stock.loss(key(),new StockOperations.Loss(product,amount("1"),"Perda de teste"),"test").block().get("id");
        long expense=expense("19").block().get("id");
        long salePayment=Sql.id(sql.one("SELECT s.id FROM settlements s JOIN settlement_allocations a ON a.settlement_id=s.id JOIN financial_titles t ON t.id=a.title_id WHERE t.sale_id=:id",Map.of("id",sale)).block(),"id");
        long purchasePayment=Sql.id(sql.one("SELECT s.id FROM settlements s JOIN settlement_allocations a ON a.settlement_id=s.id JOIN financial_titles t ON t.id=a.title_id WHERE t.purchase_id=:id",Map.of("id",purchase)).block(),"id");
        var originalMetrics=metrics(first,first);
        long closing=closings.close(key(),new ClosingService.ClosePeriod(first,first,"Fechamento antes da correção"),"test").block().get("id");
        String frozen=closings.json(closing).block();
        at(1,"12:00:00");

        assertThatThrownBy(() -> cancel(CorrectionService.Kind.SALE,sale).block()).hasMessageContaining("pagamentos");
        assertThat(countCorrections()).isZero();
        cancel(CorrectionService.Kind.PAYMENT,purchasePayment).block();
        assertThatThrownBy(() -> cancel(CorrectionService.Kind.PURCHASE,purchase).block()).hasMessageContaining("movimentos posteriores");
        cancel(CorrectionService.Kind.PAYMENT,salePayment).block();
        assertThatThrownBy(() -> cancel(CorrectionService.Kind.SALE,sale).block()).hasMessageContaining("movimentos posteriores");
        cancel(CorrectionService.Kind.EXPENSE,expense).block();
        cancel(CorrectionService.Kind.LOSS,loss).block();
        String once=key();
        var reason=new CorrectionService.Request("Venda registrada com erro");
        long saleCorrection=corrections.cancel(once,CorrectionService.Kind.SALE,sale,reason,"test").block().get("id");
        assertThat(corrections.cancel(once,CorrectionService.Kind.SALE,sale,reason,"test").block().get("id")).isEqualTo(saleCorrection);
        assertThatThrownBy(() -> cancel(CorrectionService.Kind.SALE,sale).block()).hasMessageContaining("já foi cancelado");
        cancel(CorrectionService.Kind.PURCHASE,purchase).block();
        assertThat(countCorrections()).isEqualTo(6);

        var balance=sql.one("SELECT * FROM stock_balances WHERE product_id=:id",Map.of("id",product)).block();
        number(balance,"quantity","0"); number(balance,"stock_value","0");
        assertThat(metrics(first,first)).isEqualTo(originalMetrics);
        assertThat(closings.json(closing).block()).isEqualTo(frozen);
        var adjusted=metrics(first,first.plusDays(1));
        for(String field:List.of("revenue","cost_of_goods","expenses","losses","received","paid","receivables","payables","purchase_payables","purchased_kg","sold_kg","lost_kg")) number(adjusted,field,"0");
        var current=metrics(first.plusDays(1),first.plusDays(1));
        number(current,"revenue","-240"); number(current,"received","-40"); number(current,"paid","-200");
        number(current,"expenses","-19"); number(current,"lost_kg","-1");
        var oldSales=trades.list(true,new PageQuery(1,1,""),first,first).block();
        number(oldSales.summary(),"total","240");
        number(oldSales.summary(),"quantity","5");
        var reversedSales=trades.list(true,new PageQuery(1,1,""),first.plusDays(1),first.plusDays(1)).block();
        assertThat(reversedSales.items()).isEmpty();
        number(reversedSales.summary(),"total","-240");
        number(reversedSales.summary(),"quantity","-5");
        number(reversedSales.summary(),"reversed_total","240");
        var reversedPurchases=trades.list(false,new PageQuery(1,1,""),first.plusDays(1),first.plusDays(1)).block();
        number(reversedPurchases.summary(),"total","-600");
        number(reversedPurchases.summary(),"quantity","-20");
        number(trades.list(false,new PageQuery(1,1,""),first,first.plusDays(1)).block().summary(),"total","0");
        assertThatThrownBy(() -> trades.list(true,new PageQuery(1,1,""),first,null).block()).hasMessageContaining("duas datas");
        assertThatThrownBy(() -> trades.list(false,new PageQuery(1,1,""),first.plusDays(1),first).block()).hasMessageContaining("período válido");
        var analytics=dashboard.load(first,first.plusDays(1)).block();
        assertThat(analytics.get("metrics")).isEqualTo(adjusted);
        var composition=(Map<String,Object>)analytics.get("composition");
        number(composition,"sales_total","0"); number(composition,"sales_paid","0");

        long title=Sql.id(sql.one("SELECT id FROM financial_titles WHERE sale_id=:id",Map.of("id",sale)).block(),"id");
        assertThatThrownBy(() -> finance.payment(key(),new FinanceService.Payment("PIX",List.of(new FinanceService.Allocation(title,amount("1")))),"test").block()).hasMessageContaining("cancelado");
        var history=finance.titles("RECEIVABLE",customer,false,false,new PageQuery(1,20,"")).block();
        assertThat(history.items()).hasSize(1);
        number(history.items().getFirst(),"outstanding","0");
        assertThat(catalog.partners(true,new PageQuery(1,20,"Cliente correção"),false).block().items().getFirst().get("balance").toString()).startsWith("0");

        long replacement=expense("21").block().get("id");
        long correctedExpense=Sql.id(sql.one("SELECT id FROM corrections WHERE kind='EXPENSE' AND source_id=:id",Map.of("id",expense)).block(),"id");
        corrections.link(key(),correctedExpense,new CorrectionService.Replacement(replacement),"test").block();
        assertThatThrownBy(() -> corrections.link(key(),correctedExpense,new CorrectionService.Replacement(replacement),"test").block()).hasMessageContaining("Já existe");
        assertThat(corrections.preview(CorrectionService.Kind.EXPENSE,expense).block().get("correction").toString()).contains("replacement_id="+replacement);
        assertThatThrownBy(() -> sql.update("UPDATE corrections SET reason='alterado' WHERE id=:id",Map.of("id",correctedExpense)).block()).hasMessageContaining("imutaveis");

        long concurrent=expense("12").block().get("id");
        var results=Flux.range(0,4).flatMap(i -> cancel(CorrectionService.Kind.EXPENSE,concurrent)
            .map(result -> "ok").onErrorResume(ResponseStatusException.class,e -> e.getStatusCode().value()==409 ? Mono.just("conflict") : Mono.error(e)),4).collectList().block();
        assertThat(results.stream().filter("ok"::equals).count()).isEqualTo(1);

        long one=expense("10").block().get("id");
        long two=expense("20").block().get("id");
        long titleOne=Sql.id(sql.one("SELECT id FROM financial_titles WHERE expense_id=:id",Map.of("id",one)).block(),"id");
        long titleTwo=Sql.id(sql.one("SELECT id FROM financial_titles WHERE expense_id=:id",Map.of("id",two)).block(),"id");
        long sharedPayment=finance.payment(key(),new FinanceService.Payment("PIX",List.of(
            new FinanceService.Allocation(titleOne,amount("5")),
            new FinanceService.Allocation(titleTwo,amount("6")))),"test").block().get("id");
        assertThat((List<?>)corrections.preview(CorrectionService.Kind.PAYMENT,sharedPayment).block().get("allocations")).hasSize(2);
        assertThatThrownBy(() -> cancel(CorrectionService.Kind.EXPENSE,one).block()).hasMessageContaining("pagamentos");
        cancel(CorrectionService.Kind.PAYMENT,sharedPayment).block();
        cancel(CorrectionService.Kind.EXPENSE,one).block();
        var titles=finance.titles("PAYABLE",0,false,false,new PageQuery(1,100,"")).block().items();
        number(titles.stream().filter(t -> Sql.id(t,"id")==titleTwo).findFirst().orElseThrow(),"outstanding","20");

        // Failure after the first item has been restored must roll back stock AND the correction.
        long second=catalog.createProduct(new CatalogService.Product("REV-QA-2","Outro produto",amount("40"),BigDecimal.ZERO,true)).block().get("id");
        long multi=trades.confirm(false,key(),new TradeService.Trade(null,List.of(
            new TradeService.Item(product,amount("2"),amount("30")),
            new TradeService.Item(second,amount("3"),amount("40"))),BigDecimal.ZERO,"PIX",first,false,null),"test").block().get("id");
        long before=countCorrections();
        sql.update("CREATE TRIGGER correction_test_failure BEFORE UPDATE ON stock_balances FOR EACH ROW BEGIN IF NEW.product_id="+second+" THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Forced correction failure'; END IF; END",Map.of()).block();
        try { assertThatThrownBy(() -> cancel(CorrectionService.Kind.PURCHASE,multi).block()).hasMessageContaining("Forced correction failure"); }
        finally { sql.update("DROP TRIGGER correction_test_failure",Map.of()).block(); }
        assertThat(countCorrections()).isEqualTo(before);
        number(sql.one("SELECT * FROM stock_balances WHERE product_id=:id",Map.of("id",product)).block(),"quantity","2");
        catalog.editProduct(product,new CatalogService.Product("REV-QA","Camarão correção",amount("50"),BigDecimal.ZERO,false)).block();
        cancel(CorrectionService.Kind.PURCHASE,multi).block();
        number(sql.one("SELECT * FROM stock_balances WHERE product_id=:id",Map.of("id",product)).block(),"quantity","0");

        long dayClosing=closings.close(key(),new ClosingService.ClosePeriod(first.plusDays(1),first.plusDays(1),"Correções do dia"),"test").block().get("id");
        assertThat(closings.json(dayClosing).block()).contains("correction_replacements","Registro de teste incorreto","correction_stock");
        assertThatThrownBy(() -> cancel(CorrectionService.Kind.EXPENSE,replacement).block()).hasMessageContaining("fechado");
        at(2,"23:59:00");
        assertThatThrownBy(() -> cancel(CorrectionService.Kind.EXPENSE,replacement).block()).hasMessageContaining("encerrado");

        // A snapshot captured after a later correction must still show the old day's position.
        at(3,"12:00:00");
        long old=expense("7").block().get("id");
        long oldTitle=Sql.id(sql.one("SELECT id FROM financial_titles WHERE expense_id=:id",Map.of("id",old)).block(),"id");
        var beforeLaterCorrection=metrics(first.plusDays(3),first.plusDays(3));
        at(4,"12:00:00");
        cancel(CorrectionService.Kind.EXPENSE,old).block();
        long pastClosing=closings.close(key(),new ClosingService.ClosePeriod(first.plusDays(3),first.plusDays(3),"Captura histórica"),"test").block().get("id");
        var snapshot=(com.fasterxml.jackson.databind.JsonNode)closings.detail(pastClosing).block().get("snapshot");
        var rows=snapshot.get("records").get("titles");
        for(var row:rows) {
            if(row.get("id").asLong()==oldTitle) {
                assertThat(row.get("correction_id").isNull()).isTrue();
                assertThat(row.get("cancelled_at").isNull()).isTrue();
                assertThat(row.get("outstanding").decimalValue()).isEqualByComparingTo("7");
            }
        }
        assertThat(metrics(first.plusDays(3),first.plusDays(3))).isEqualTo(beforeLaterCorrection);
        assertThat(closings.json(closing).block()).isEqualTo(frozen);
    }
}

