package br.com.camarao.stock;

import br.com.camarao.shared.Rules;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.*;

class StockCostTest {
    private BigDecimal n(String value) { return new BigDecimal(value); }
    @Test void saleUsesWeightedCost() {
        var result=StockService.calculate(n("20"),n("700"),n("5"));
        assertThat(result.unitCost()).isEqualByComparingTo("35");
        assertThat(result.totalCost()).isEqualByComparingTo("175");
    }
    @Test void lastSaleConsumesRoundingResidue() {
        var first=StockService.calculate(n("3"),n("1"),n("1"));
        var second=StockService.calculate(n("2"),n("1").subtract(first.totalCost()),n("1"));
        var last=StockService.calculate(n("1"),n("1").subtract(first.totalCost()).subtract(second.totalCost()),n("1"));
        assertThat(first.totalCost().add(second.totalCost()).add(last.totalCost())).isEqualByComparingTo("1");
    }
    @Test void blocksOverselling() {
        assertThatThrownBy(() -> StockService.calculate(n("5"),n("150"),n("5.001"))).isInstanceOf(ResponseStatusException.class);
    }
    @Test void blocksZeroAndNegativeQuantities() {
        assertThatThrownBy(() -> StockService.calculate(n("5"),n("150"),n("0"))).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> StockService.calculate(n("5"),n("150"),n("-1"))).isInstanceOf(ResponseStatusException.class);
    }
    @Test void roundsCurrencyHalfUp() {
        assertThat(Rules.money(n("1.005"))).isEqualByComparingTo("1.01");
        assertThat(Rules.start(java.time.LocalDate.of(2026,10,28))).isEqualTo(java.time.LocalDateTime.of(2026,10,28,3,0));
    }
}
