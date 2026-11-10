package br.com.camarao.admin;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class HomologationResetTest {
 @Test void requiresBothExplicitHomologationAndPermission(){
  assertFalse(new HomologationReset("production",true,"","","").enabled);
  assertFalse(new HomologationReset("homologation",false,"","","").enabled);
  assertTrue(new HomologationReset("homologation",true,"","","").enabled);
 }
}
