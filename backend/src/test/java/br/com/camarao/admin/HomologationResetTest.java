package br.com.camarao.admin;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class HomologationResetTest {
 @Test void temporarilyEnabledInProductionAndHomologation(){
  assertTrue(new HomologationReset("production","","","").enabled);
  assertTrue(new HomologationReset("homologation","","","").enabled);
 }
}
