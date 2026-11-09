package br.com.camarao.opening;

import br.com.camarao.catalog.CatalogService;
import br.com.camarao.closing.*;
import br.com.camarao.finance.FinanceService;
import br.com.camarao.report.*;
import br.com.camarao.shared.*;
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
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@EnabledIfEnvironmentVariable(named="OPENING_DB_TEST",matches="true")
@SpringBootTest(properties={"app.closing.scheduling-enabled=false","spring.r2dbc.url=r2dbc:mysql://127.0.0.1:13307/camarao_test","spring.flyway.url=jdbc:mysql://127.0.0.1:13307/camarao_test?connectionTimeZone=UTC"})
class OpeningDatabaseTest {
    @Autowired OpeningService opening;
    @Autowired CatalogService catalog;
    @Autowired FinanceService finance;
    @Autowired TradeService trades;
    @Autowired ClosingService closings;
    @Autowired ReportService reports;
    @Autowired ReportExportService exports;
    @Autowired DashboardService dashboard;
    @Autowired Sql sql;
    @MockitoBean Clock clock;
    private final AtomicReference<Instant> instant=new AtomicReference<>();
    private final LocalDate first=LocalDate.of(2032,2,28);
    private static BigDecimal amount(String value){return new BigDecimal(value);}
    private static String key(){return UUID.randomUUID().toString();}
    private void at(int day,String time){instant.set(first.plusDays(day).atTime(LocalTime.parse(time)).atZone(Rules.ZONE).toInstant());}
    @SuppressWarnings("unchecked") private Map<String,Object> metrics(LocalDate day){return (Map<String,Object>)reports.report(day,day).block().get("metrics");}
    private void number(Map<String,Object> row,String field,String expected){assertThat(Sql.decimal(row,field)).as(field).isEqualByComparingTo(expected);}
    @SuppressWarnings("unchecked")
    @Test void initialBalancesNeverBecomeSalesAndRemainHistoricallyStable() {
        when(clock.instant()).thenAnswer(ignored->instant.get());at(0,"10:00:00");
        long customer=catalog.createPartner(true,key(),new CatalogService.Partner("Cliente da implantação","","","",true),"test").block().get("id");
        var body=new OpeningService.Request(amount("200"),List.of(new OpeningService.Stock(1,amount("5"),amount("20"))),List.of(
            new OpeningService.Debt("RECEIVABLE",customer,"Saldo antigo a receber",amount("50"),first,false),
            new OpeningService.Debt("PAYABLE",null,"Compra sem fornecedor",amount("40"),first,true),
            new OpeningService.Debt("PAYABLE",null,"Outra conta antiga",amount("30"),first,false)),"Planilha anterior",true);
        long old=opening.confirm(key(),body,"test").block().get("id");
        at(0,"10:30:00");opening.undo(key(),old,new OpeningService.Undo("Conferir os saldos novamente"),"test").block();
        number(metrics(first),"initial_cash","0");number(metrics(first),"receivables","0");
        at(0,"11:00:00");long id=opening.confirm(key(),body,"test").block().get("id");
        var before=metrics(first);number(before,"initial_cash","200");number(before,"closing_cash","200");number(before,"revenue","0");number(before,"purchases","0");
        number(before,"receivables","50");number(before,"payables","70");number(before,"purchase_payables","40");number(before,"operating_result","0");
        var charts=dashboard.load(first,first).block();assertThat((BigDecimal)charts.get("stock_kg")).isEqualByComparingTo("5");
        var composition=(Map<String,Object>)charts.get("composition");number(composition,"sales_total","0");number(composition,"purchases_total","0");
        var point=((List<Map<String,Object>>)charts.get("series")).getFirst();number(point,"purchased_kg","0");number(point,"sold_kg","0");
        at(0,"11:05:00");long closure=closings.close(key(),new ClosingService.ClosePeriod(first,first,"Antes dos recebimentos"),"test").block().get("id");
        String snapshot=closings.json(closure).block();
        assertThatThrownBy(()->opening.undo(key(),id,new OpeningService.Undo("O período já foi fechado"),"test").block()).isInstanceOf(ResponseStatusException.class);
        at(1,"09:00:00");
        assertThatThrownBy(()->opening.undo(key(),id,new OpeningService.Undo("Não desfazer em outro dia"),"test").block()).isInstanceOf(ResponseStatusException.class);
        var titles=sql.all("SELECT * FROM financial_titles WHERE opening_id=:id",Map.of("id",id)).collectList().block();
        long receivable=titles.stream().filter(t->"RECEIVABLE".equals(t.get("nature"))).mapToLong(t->Sql.id(t,"id")).findFirst().orElseThrow();
        long payable=titles.stream().filter(t->"PAYABLE".equals(t.get("nature")) && Sql.decimal(t,"amount").compareTo(amount("40"))==0).mapToLong(t->Sql.id(t,"id")).findFirst().orElseThrow();
        finance.payment(key(),new FinanceService.Payment("PIX",List.of(new FinanceService.Allocation(receivable,amount("30")))),"test").block();
        finance.payment(key(),new FinanceService.Payment("PIX",List.of(new FinanceService.Allocation(payable,amount("10")))),"test").block();
        var second=metrics(first.plusDays(1));number(second,"opening_cash","200");number(second,"initial_cash","0");number(second,"closing_cash","220");number(second,"revenue","0");number(second,"operating_result","0");number(second,"receivables","20");number(second,"payables","60");
        number(metrics(first),"receivables","50");number(metrics(first),"closing_cash","200");assertThat(closings.json(closure).block()).isEqualTo(snapshot);
        trades.confirm(true,key(),new TradeService.Trade(customer,List.of(new TradeService.Item(1,amount("2"),amount("50"))),BigDecimal.ZERO,"PIX",first.plusDays(1),false,amount("10")),"test").block();
        var after=metrics(first.plusDays(1));number(after,"revenue","90");number(after,"cost_of_goods","40");number(after,"operating_result","50");number(after,"receivables","110");
        assertThat(opening.status().block().get("canUndo")).isEqualTo(false);
        String csv=exports.export(first,first.plusDays(1),"month").block();assertThat(csv.lines().count()).isEqualTo(2);assertThat(csv.length()).isLessThan(16000);
        at(2,"23:59:00");assertThatThrownBy(()->opening.confirm(key(),body,"test").block()).isInstanceOf(ResponseStatusException.class);
        assertThat(Sql.id(sql.one("SELECT COUNT(*) AS total FROM opening_balances",Map.of()).block(),"total")).isEqualTo(2);
    }
}
