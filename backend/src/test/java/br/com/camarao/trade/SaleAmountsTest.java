package br.com.camarao.trade;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import org.springframework.web.server.ResponseStatusException;

class SaleAmountsTest {
    @Test void subtractsMoneyExactly() {
        var amounts=SaleAmounts.calculate(new BigDecimal("100.01"),new BigDecimal("0.02"));
        assertThat(amounts.net()).isEqualByComparingTo("99.99");
        assertThat(amounts.gross()).isEqualByComparingTo("100.01");
    }
    @Test void omittedDiscountKeepsOriginalTotal() {
        assertThat(SaleAmounts.calculate(new BigDecimal("50.00"),null).net()).isEqualByComparingTo("50.00");
    }
    @Test void fullDiscountProducesZeroTotal() {
        assertThat(SaleAmounts.calculate(new BigDecimal("50.00"),new BigDecimal("50.00")).net()).isEqualByComparingTo("0");
    }
    @Test void rejectsOverDiscountAndNegativeDiscount() {
        assertThatThrownBy(() -> SaleAmounts.calculate(new BigDecimal("50"),new BigDecimal("50.01"))).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> SaleAmounts.calculate(new BigDecimal("50"),new BigDecimal("-0.01"))).isInstanceOf(ResponseStatusException.class);
    }
    @Test void rejectsFractionsOfCent() {
        assertThatThrownBy(() -> SaleAmounts.calculate(new BigDecimal("50"),new BigDecimal("0.001"))).isInstanceOf(ResponseStatusException.class);
    }
}
