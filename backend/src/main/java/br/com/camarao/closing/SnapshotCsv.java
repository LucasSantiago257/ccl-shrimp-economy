package br.com.camarao.closing;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
@Component
public class SnapshotCsv {
    private final ObjectMapper mapper;
    public SnapshotCsv(ObjectMapper mapper) { this.mapper=mapper; }
    public String render(String json) {
        try {
            StringBuilder csv=new StringBuilder("\uFEFFSeção;Registro;Campo;Valor\r\n");
            JsonNode root=mapper.reader().with(com.fasterxml.jackson.databind.DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS).readTree(json);
            root.fields().forEachRemaining(e->walk(csv,e.getKey(),"",e.getValue()));
            return csv.toString();
        } catch(com.fasterxml.jackson.core.JsonProcessingException e) { throw new IllegalStateException("Snapshot inválido.",e); }
    }
    private void walk(StringBuilder csv,String section,String path,JsonNode node) {
        if(node.isObject()) {
            node.fields().forEachRemaining(e->walk(csv,section,path.isEmpty()?e.getKey():path+"."+e.getKey(),e.getValue()));
        } else if(node.isArray()) {
            for(int i=0;i<node.size();i++) walk(csv,section,path+"["+i+"]",node.get(i));
        } else {
            String value=node.isNull()?"":node.isNumber()?node.decimalValue().toPlainString().replace('.',','):node.asText();
            String trimmed=value.stripLeading();
            if(node.isTextual() && !trimmed.isEmpty() && "=+-@".indexOf(trimmed.charAt(0))>=0) value="'"+value;
            csv.append(cell(section)).append(';').append(cell(path.contains("[")?path.substring(path.indexOf('[')+1,path.indexOf(']')):""))
                .append(';').append(cell(path)).append(';').append(cell(value)).append("\r\n");
        }
    }
    private String cell(String value) { return "\""+value.replace("\"","\"\"")+"\""; }
}

