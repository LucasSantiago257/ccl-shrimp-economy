package br.com.camarao.shared;

import java.util.List;
import java.util.Map;

public record PageResult(List<Map<String,Object>> items,int page,int size,long total,long totalPages,
                         boolean hasNext,boolean hasPrevious,Map<String,Object> summary) {}
