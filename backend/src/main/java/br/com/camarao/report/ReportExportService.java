package br.com.camarao.report;

import br.com.camarao.shared.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import reactor.core.publisher.*;

@Service
public class ReportExportService {
    private final ReportService reports;
    public ReportExportService(ReportService reports) {this.reports=reports;}
    private static final String[][] COLUMNS={
        {"gross_revenue","Vendas brutas (R$)"},{"discounts","Descontos (R$)"},{"revenue","Vendas líquidas (R$)"},
        {"purchases","Compras (R$)"},{"cost_of_goods","Custo das mercadorias vendidas (R$)"},{"gross_profit","Lucro bruto (R$)"},
        {"expenses","Despesas (R$)"},{"losses","Custo das perdas (R$)"},{"operating_result","Resultado gerencial (R$)"},
        {"received","Recebimentos (R$)"},{"paid","Pagamentos (R$)"},{"cash_flow","Movimento de caixa (R$)"},
        {"opening_cash","Saldo de caixa antes do período (R$)"},{"initial_cash","Saldo inicial importado no período (R$)"},{"closing_cash","Saldo de caixa na data final (R$)"},
        {"receivables","Contas a receber na data final (R$)"},{"purchase_payables","Compras a pagar na data final (R$)"},{"payables","Total a pagar na data final (R$)"},
        {"purchased_kg","Quilos comprados"},{"sold_kg","Quilos vendidos"},{"lost_kg","Quilos perdidos"}
    };
    record Range(LocalDate from,LocalDate to) {}
    static List<Range> ranges(LocalDate from,LocalDate to,String grouping) {
        Rules.require(!from.isAfter(to) && ChronoUnit.DAYS.between(from,to)<=3660,"Escolha um período válido de até dez anos.");
        Rules.require(grouping.equals("total") || grouping.equals("month"),"Escolha resumo mensal ou consolidado.");
        if(grouping.equals("total"))return List.of(new Range(from,to));
        Rules.require(ChronoUnit.DAYS.between(from,to)<366,"O resumo mensal aceita até 366 dias. Para intervalos maiores, use o consolidado.");
        var result=new ArrayList<Range>();
        for(LocalDate date=from;!date.isAfter(to);){LocalDate end=date.withDayOfMonth(date.lengthOfMonth());if(end.isAfter(to))end=to;result.add(new Range(date,end));date=end.plusDays(1);}
        return result;
    }
    @Transactional(readOnly=true)
    public Mono<String> export(LocalDate from,LocalDate to,String grouping) {
        var ranges=ranges(from,to,grouping);
        var headings=new ArrayList<String>(List.of("Data inicial","Data final"));
        for(var column:COLUMNS)headings.add(column[1]);
        headings.add("Estoque na data final (kg)");headings.add("Valor do estoque na data final (R$)");
        return Flux.fromIterable(ranges).concatMap(range->reports.report(range.from(),range.to()).map(report->row(range,report)))
            .collectList().map(rows->"\uFEFF"+line(headings)+String.join("",rows));
    }
    @SuppressWarnings("unchecked")
    private String row(Range range,Map<String,Object> report) {
        var values=new ArrayList<String>(List.of(range.from().toString(),range.to().toString()));
        var metrics=(Map<String,Object>)report.get("metrics");
        for(var column:COLUMNS)values.add(decimal(Sql.decimal(metrics,column[0])));
        var stock=(List<Map<String,Object>>)report.get("stock");
        values.add(decimal(stock.stream().map(r->Sql.decimal(r,"quantity")).reduce(BigDecimal.ZERO,BigDecimal::add)));
        values.add(decimal(stock.stream().map(r->Sql.decimal(r,"stock_value")).reduce(BigDecimal.ZERO,BigDecimal::add)));
        return line(values);
    }
    private static String decimal(BigDecimal number){return number.toPlainString().replace('.',',');}
    private static String line(List<String> cells){return cells.stream().map(s->"\""+s.replace("\"","\"\"")+"\"").collect(java.util.stream.Collectors.joining(";"))+"\r\n";}
}
