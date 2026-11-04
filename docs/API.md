# API inicial

JSON em `/api/v1`. Campos financeiros e quantidades podem ser enviados como strings decimais com ponto. IDs são números inteiros positivos.

## Paginação

GET de `/customers`, `/suppliers`, `/products`, `/sales`, `/purchases`, `/expenses`, `/titles`, `/settlements`, `/stock/movements` e `/closings` retorna um objeto paginado. Essa resposta substitui os arrays da versão inicial; a interface e os testes foram atualizados em conjunto.

Parâmetros comuns: `page` a partir de 1 (padrão 1), `size` entre 1 e 100 (padrão 20) e `q` de até 200 caracteres. Exemplo: `/customers?page=2&size=20&q=Maria`. `%`, `_` e `!` na busca são tratados como texto literal. Valores inválidos retornam 400.

Formato (itens abreviados):

```json
{"items":[{"id":1,"name":"Maria"}],"page":1,"size":20,"total":42,"totalPages":3,"hasNext":true,"hasPrevious":false,"summary":{}}
```

`total` é a quantidade de registros, não um valor financeiro. Uma página além da última retorna `items:[]`, mantendo a contagem real. A ordenação inclui o ID para desempate.

`summary` agrega todos os registros do filtro, não apenas a página: `balance` em clientes/fornecedores; `quantity` e `stock_value` em produtos; `total` em documentos/despesas; `amount`, `paid` e `outstanding` em títulos. Quando não há agregação específica, é `{}`. Contagem, resumo e página são consultados na mesma transação de leitura.

Relatórios, snapshots completos e itens de um documento continuam com seus formatos próprios, sem cortes por paginação.

## Autenticação

1. GET `/api/auth/csrf`: retorna `token` e `header`, e inicia a sessão.
2. POST `/api/login`: formulário URL-encoded com `username` e `password`; enviar cookie de sessão e o header CSRF retornado. Sucesso 204, falha 401.
3. GET `/api/auth/me`: retorna o usuário autenticado.
4. POST `/api/logout`: encerra a sessão; enviar CSRF.

Depois de autenticar, obtenha novamente o CSRF antes dos comandos. O navegador inclui o cookie HttpOnly automaticamente. Não usar Basic Auth.

## Cadastros

- GET/POST `/customers` e `/suppliers`; PUT `/{id}` para editar/inativar.
- GET aceita `q` (nome, telefone ou documento) e `activeOnly=true`.
- GET/POST `/products`; PUT `/products/{id}`.
- Produtos aceitam `q` por nome/código, `activeOnly=true` e `inStockOnly=true`.

Cliente/fornecedor:

```json
{"name":"Maria","phone":"71999990000","document":"","notes":"","active":true}
```

Produto:

```json
{"code":"CAM-002","name":"Camarão grande","suggestedPrice":"60.00","minimumStock":"5.000","active":true}
```

## Operações

POSTs abaixo exigem `Idempotency-Key` de 16 a 64 caracteres alfanuméricos, `_` ou `-` (UUID recomendado). Repetir o mesmo corpo com a mesma chave não duplica o lançamento. Uma mesma chave não pode representar dois comandos diferentes.

GET/POST `/purchases` ou `/sales`. Exemplo de venda:

```json
{
  "partyId": 1,
  "items": [{"productId":1,"quantity":"10.000","unitPrice":"50.00"}],
  "discountAmount":"50.00",
  "paidAmount":"200.00",
  "method":"PIX",
  "dueDate":"2026-10-30"
}
```

`partyId` é fornecedor na compra e cliente na venda. Nas compras pode ser omitido ou enviado como `null`; nas vendas continua obrigatório. `paidAmount=0` cria dívida integral; igual ao total quita imediatamente. A propriedade opcional `payInFull=true` solicita quitação do total exato calculado no servidor, substituindo `paidAmount`; a interface utiliza essa opção para pagamento integral sem depender da estimativa numérica do navegador. Itens não podem repetir produto. Total mínimo de um centavo por item. Métodos: CASH, PIX, TRANSFER ou CARD. Retorno `{"id":1}`. GET `/{sales|purchases}/{id}/items` mostra os itens.

`discountAmount` é opcional nas vendas (padrão zero) e deve ter no máximo duas casas decimais. `gross_total` é a soma dos itens; `discount_amount` é o desconto do documento; `total` é o valor líquido. `paidAmount` não pode ultrapassar esse líquido e `payInFull` quita o líquido exato. O exemplo acima gera venda de R$ 450, pagamento de R$ 200 e dívida de R$ 250.

Desconto integral é permitido: gera venda de total zero com custo e movimento de estoque, mas sem título ou recebimento. Nas compras omita o desconto ou envie zero. Os itens preservam seus subtotais brutos, sem rateio do desconto global. Novos snapshots usam `schemaVersion=2`; os anteriores permanecem íntegros.

POST `/settlements` permite quitar parcialmente ou distribuir um pagamento entre títulos da mesma pessoa/natureza:

```json
{"method":"PIX","allocations":[{"titleId":1,"amount":"100.00"},{"titleId":2,"amount":"50.00"}]}
```

GET `/titles?nature=RECEIVABLE` ou `PAYABLE`; filtros opcionais `customerId`, `openOnly=true` e `purchasesOnly=true`. Cada título retorna `amount`, `paid` e `outstanding`. Compras sem fornecedor usam uma identificação pelo número da compra. GET `/settlements?customerId=1` mostra recebimentos do cliente. Datas dos pagamentos são geradas pelo servidor.

GET/POST `/expenses`:

```json
{"description":"Gelo","category":"Conservação","amount":"100.00","paidAmount":"50.00","method":"CASH","dueDate":"2026-10-30"}
```

GET `/stock/movements?productId=1`. POST `/stock/losses`:

```json
{"productId":1,"quantity":"0.500","reason":"Descarte por conservação"}
```

GET `/reports/result?from=2026-10-01&to=2026-10-31`: `metrics` com subtotal das vendas (`gross_revenue`), descontos (`discounts`), receita líquida (`revenue`), CMV, resultado, despesas, perdas, caixa e contas abertas; `stock` com posições históricas por produto. Datas inclusivas e período de até dez anos.

`receivables` representa o saldo de vendas a receber; `purchase_payables` representa apenas compras ainda a pagar. `payables` inclui também despesas. Esses totais são calculados sobre todos os títulos, independentemente do limite das listas da interface.

## Dashboards

GET `/reports/dashboard?from=AAAA-MM-DD&to=AAAA-MM-DD` retorna `from`, `to`, `timezone`, `grouping`, `metrics` (mesmos indicadores do fechamento), `stock_kg`, `composition` e `series`. Em `composition`, `sales_total`, `sales_paid`, `purchases_total` e `purchases_paid` consideram documentos do intervalo e pagamentos até o fim do último dia. Cada ponto da série traz suas datas inclusivas e os valores de receita, resultado, caixa e quilos. O intervalo aceita de 1 a 366 dias. O agrupamento é `day` até 31 dias, `week` até 90 e `month` acima disso, respeitando America/Bahia.

## Fechamentos

- GET `/closings`: metadados paginados e pesquisáveis dos fechamentos, sem recalcular snapshots.
- GET `/closings/status`: data operacional atual, indicador `closed` e ID do fechamento quando o snapshot já estiver preservado. A partir das 23h59 (America/Bahia), retorna `closed=true` mesmo se a captura ainda estiver pendente; nesse caso, informa `automaticClosingPending=true` sem `closureId`.
- POST `/closings`, com CSRF e `Idempotency-Key`:

```json
{"from":"2026-10-28","to":"2026-10-28","note":"Conferência do dia"}
```

Datas são inclusivas no fuso America/Bahia. Pode fechar hoje ou datas anteriores, por até dez anos, desde que não haja sobreposição. Fechar hoje impede novos lançamentos no mesmo dia para toda a empresa. Amanhã, se não estiver fechado, volta a ser possível lançar. Não existe reabertura.

O servidor fecha cada dia automaticamente às 23h59 nesse fuso, com autor `Sistema (automático)`. Nenhum comando HTTP é necessário. Novos lançamentos são recusados a partir desse horário, independentemente do progresso da captura. Após reiniciar, o servidor recupera dias pendentes desde a ativação; fechamentos manuais existentes são mantidos. A API de fechamento manual continua disponível para antecipar o encerramento ou fechar outros intervalos.

- GET `/closings/{id}`: `{metadata,snapshot}`. Inclui intervalo, autor, horário, versão, SHA-256 e conteúdo congelado (relatório e registros).
- GET `/closings/{id}/snapshot`: download do JSON original, com `Content-Disposition: attachment`. O SHA-256 é calculado sobre os bytes UTF-8 desse arquivo e pode ser comparado ao metadado `snapshot_sha256`.
- Leituras verificam a integridade. Não existem PUT/PATCH/DELETE para snapshots.

Compras, vendas, pagamentos, despesas e perdas tentados em dia fechado retornam 409. A checagem e as gravações compartilham a transação do bloqueio, cobrindo concorrência. Reenvio idempotente de um comando que já havia sido concluído retorna seu ID original, sem novo lançamento.

## Erros

- 400: formato inválido ou validação de campos.
- 401: sem autenticação/sessão expirada.
- 403: CSRF ausente ou inválido.
- 404: cadastro ou título não encontrado.
- 409: estoque insuficiente, chave reutilizada incorretamente, duplicidade ou conflito concorrente.
- 422: regra de negócio violada, por exemplo pagamento acima da dívida.

Erros de validação e domínio retornam `message` e, quando aplicável, `errors`. O cliente deve recarregar os dados em conflitos e manter a chave quando reenviar um comando idêntico após falha de rede.
