package br.com.camarao.trade;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class BoxQuantityTest {
    private BigDecimal n(String value){return new BigDecimal(value);}
    @Test void validatesExactConversionAndUsesKilogramsForTotals(){
        var item=new TradeService.Item(1,n("30"),n("50"),n("2"),n("15"));
        assertDoesNotThrow(item::validateBoxes);
        assertEquals(n("1500.00"),item.total());
        assertDoesNotThrow(new TradeService.Item(1,n("6.250"),n("50"),n("0.5"),n("12.5"))::validateBoxes);
    }
    @Test void rejectsIncompleteOrRoundedConversion(){
        assertThrows(RuntimeException.class,new TradeService.Item(1,n("30"),n("50"),n("2"),null)::validateBoxes);
        assertThrows(RuntimeException.class,new TradeService.Item(1,n("30"),n("50"),null,n("15"))::validateBoxes);
        assertThrows(RuntimeException.class,new TradeService.Item(1,n("29.999"),n("50"),n("2"),n("15"))::validateBoxes);
        assertThrows(RuntimeException.class,new TradeService.Item(1,n("30"),n("50"),n("-2"),n("-15"))::validateBoxes);
    }
    @Test void preservesSerializedKilogramRequestsForExistingIdempotencyKeys() throws Exception {
        assertEquals("{\"productId\":1,\"quantity\":30,\"unitPrice\":50}",new ObjectMapper().writeValueAsString(new TradeService.Item(1,n("30"),n("50"))));
    }
}
