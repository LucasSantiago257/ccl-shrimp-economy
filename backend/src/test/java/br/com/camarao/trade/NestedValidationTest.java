package br.com.camarao.trade;

import br.com.camarao.finance.FinanceService;
import jakarta.validation.Validation;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collections;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class NestedValidationTest {
    @Test void rejectsNullItemsAndAllocationsBeforeBusinessCode() {
        try(var factory=Validation.buildDefaultValidatorFactory()) {
            var validator=factory.getValidator();
            var trade=new TradeService.Trade(1L,Collections.singletonList(null),BigDecimal.ZERO,"PIX",LocalDate.now(),false,null);
            var payment=new FinanceService.Payment("PIX",Collections.singletonList(null));
            assertTrue(validator.validate(trade).stream().anyMatch(e->e.getPropertyPath().toString().startsWith("items")));
            assertTrue(validator.validate(payment).stream().anyMatch(e->e.getPropertyPath().toString().startsWith("allocations")));
        }
    }
}
