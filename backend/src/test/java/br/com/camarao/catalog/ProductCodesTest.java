package br.com.camarao.catalog;

import java.math.BigDecimal;
import jakarta.validation.Validation;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ProductCodesTest {
    @Test void normalizesAccentsSpacesAndShortNames(){
        assertEquals("CAM",ProductCodes.prefix("  Camarão rosa"));
        assertEquals("AGU",ProductCodes.prefix("Água doce"));
        assertEquals("PEI",ProductCodes.prefix("123 Peixe"));
        assertEquals("RA",ProductCodes.prefix("Rã"));
        assertEquals("PRO",ProductCodes.prefix("123 ---"));
    }
    @Test void acceptsMissingOrBlankCodeButStillValidatesNameAndCodeLength(){
        try(var factory=Validation.buildDefaultValidatorFactory()){
            var validator=factory.getValidator();
            assertTrue(validator.validate(new CatalogService.Product(null,"Camarão",BigDecimal.TEN,BigDecimal.ZERO,true)).isEmpty());
            assertTrue(validator.validate(new CatalogService.Product(" ","Camarão",BigDecimal.TEN,BigDecimal.ZERO,true)).isEmpty());
            assertFalse(validator.validate(new CatalogService.Product(null," ",BigDecimal.TEN,BigDecimal.ZERO,true)).isEmpty());
            assertFalse(validator.validate(new CatalogService.Product("X".repeat(41),"Camarão",BigDecimal.TEN,BigDecimal.ZERO,true)).isEmpty());
        }
    }
}
