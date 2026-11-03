package br.com.camarao.trade;

import br.com.camarao.shared.Rules;
import java.math.BigDecimal;

public record SaleAmounts(BigDecimal gross,BigDecimal discount,BigDecimal net) {
    public static SaleAmounts calculate(BigDecimal gross,BigDecimal requestedDiscount) {
        BigDecimal discount=requestedDiscount==null ? BigDecimal.ZERO.setScale(2) : requestedDiscount;
        Rules.require(gross.signum()>0,"O subtotal deve ser positivo.");
        Rules.require(discount.signum()>=0,"O desconto não pode ser negativo.");
        Rules.require(discount.scale()<=2,"Informe o desconto em reais e centavos.");
        Rules.require(discount.compareTo(gross)<=0,"O desconto não pode superar o subtotal da venda.");
        return new SaleAmounts(gross,discount,Rules.money(gross.subtract(discount)));
    }
}
