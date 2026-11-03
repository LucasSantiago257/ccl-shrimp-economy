# Validação

Execução inicial em 28/10/2026; atualização de desconto/paginação validada em 03/11/2026, no fuso America/Bahia.

## Resultado

| Verificação | Resultado |
|---|---|
| Compilação Java 21 / Spring Boot 3.5.16 | Aprovada |
| Testes unitários de custo, desconto, paginação e hash | 15 aprovados, 0 falhas, 0 ignorados |
| Compilação TypeScript e build Vite | Aprovados |
| Build dos containers Java e Nginx | Aprovado |
| Migrações Flyway 11.20.3 em MySQL 8.4 | V1, V2 e V3 aplicadas com sucesso |
| Integração HTTP com MySQL real | 24 de regressão + 17 de desconto/paginação + 13 de fechamento aprovadas |
| Teste no navegador Microsoft Edge | Aprovado |
| Nove telas em viewport de 390 × 844 | Sem overflow horizontal da página |
| Formulário de venda em celular | Exibido e conferido visualmente |
| Erros JavaScript durante o fluxo de navegador | Nenhum |
| Credenciais/tokens no localStorage | Nenhum |
| Ambiente final em localhost:5173 | Login 204; 1 produto inicial, estoque zero, nenhuma venda ou cliente fictício |

## Integração validada

1. Endpoints operacionais exigem autenticação.
2. Login com sessão e CSRF.
3. Banco de teste inicia sem lançamentos.
4. Cadastros e estoque inicial zero.
5. POST sem CSRF é bloqueado.
6. Compra de 100 kg a R$ 30 com pagamento integral calculado no servidor.
7. Venda de 40 kg a R$ 50 com recebimento parcial e dívida de R$ 1.000.
8. Reenvio idempotente não duplica venda/estoque; chave com outro payload é rejeitada.
9. Recebimento posterior de R$ 400 deixa dívida de R$ 600 sem movimentar estoque.
10. Despesa paga e fechamento conciliado: receita R$ 2.000, CMV R$ 1.200, lucro bruto R$ 800, resultado R$ 700, fluxo de caixa −R$ 1.700, estoque 60 kg/R$ 1.800.
11. Consulta do dia anterior não inclui operações posteriores.
12. Pagamento acima da dívida é rejeitado sem registrar movimentação.
13. Venda sem estoque não deixa documento, dívida nem movimento.
14. Quantidade negativa e precisão acima de gramas são rejeitadas.
15. Perda reduz estoque e resultado, sem alterar caixa.
16. Falha no segundo item reverte também a alteração do primeiro.
17. Duas vendas concorrentes disputando o mesmo último quilo não geram estoque negativo.
18. Dois pagamentos concorrentes não quitam além do valor devido.
19. Alterar o preço do produto não altera receita ou custo de venda antiga.
20. Um pagamento não pode misturar dívidas de clientes diferentes.
21. Um pagamento pode quitar duas contas do mesmo cliente.
22. Pagamento integral respeita HALF_UP: item de R$ 0,005 totaliza R$ 0,01.
23. Duas requisições simultâneas com a mesma chave criam uma única despesa.
24. Logout encerra o acesso.

O script reproduzível está em `scripts/integration.mjs`. O teste de concorrência usa requisições simultâneas reais ao back-end e MySQL, sem repositórios simulados.

## Fluxo de navegador

Microsoft Edge em sessão de teste sem perfil pessoal. Login → cadastro de cliente e fornecedor → compra de 5 kg → venda de 1,25 kg por R$ 62,50 com entrada de R$ 20 → recebimento adicional de R$ 10 → dívida restante de R$ 32,50.

Depois, navegação pelas telas Visão geral, Clientes, Produtos, Compras, Vendas, Estoque, Financeiro, Despesas e Fechamento em 390px. Capturas de computador, painel móvel e formulário móvel conferidas visualmente em `docs/previews/`. Tabelas largas usam rolagem interna, sem ampliar a largura da página.

## Escopo e limites dos testes

Os testes comprovam os cenários descritos; não constituem teste de carga ou auditoria de segurança/acessibilidade completa. Não houve homologação em Safari/iPhone físico, integração bancária, emissão fiscal, recuperação de desastre ou implantação pública. O ambiente operacional é separado dos volumes e lançamentos fictícios dos testes.

Cancelamentos e devoluções continuam pendentes, conforme README. O fechamento definitivo e seu bloqueio foram incluídos e validados.

## Fechamento, fornecedor opcional e painel

Treze verificações adicionais em `scripts/closing-integration.mjs`:

1. Compra sem `partyId` gera estoque, pagamento parcial e título identificado pela compra.
2. Despesa pendente aumenta o total a pagar, mas não o indicador de compras a pagar.
3. Compra com `partyId=null` pode ser quitada integralmente.
4. Venda continua exigindo cliente.
5. Fechamento de data futura ou intervalo invertido é rejeitado.
6. Fechar ontem não bloqueia lançamentos hoje.
7. Intervalos sobrepostos são rejeitados.
8. Concorrência entre despesa e fechamento define uma fronteira atômica: operação incluída por completo ou recusada.
9. Snapshot contém metadados, documentos, itens, movimentos, pagamentos e posição das contas.
10. SHA-256 do JSON baixado coincide com o hash preservado.
11. Fechamento é idempotente; nova chave para o mesmo intervalo é rejeitada.
12. Cinco tipos de lançamentos diretos à API são bloqueados após fechar o dia, sem efeitos parciais.
13. Mudanças de nome/preço em cadastros não mudam os bytes ou nomes do snapshot.

Também foram executados UPDATE e DELETE diretamente no MySQL de teste; ambos foram rejeitados pelos triggers de imutabilidade.

No navegador, foram validados compra a prazo sem fornecedor e os dois grupos de pendências no painel. `tests/closing.browser.mjs` confirmou o fechamento de um período pela interface, confirmação explícita, banner do dia fechado, abertura do snapshot, download com hash correto, layout móvel e botão de venda desabilitado.

## Desconto e paginação — 03/11/2026

`scripts/discount-pagination-integration.mjs` aprovou 17 cenários: desconto parcial, quitação pelo líquido, desconto integral sem título zero, validação de limites/precisão, idempotência, páginas vazias, busca literal por curingas, telefone/documento e navegação sem duplicações ou cortes.

A massa foi criada pela API real, com transações no MySQL: mais de 200 clientes/produtos/documentos/pagamentos, 411 movimentos do produto testado e 511 títulos a pagar correspondentes ao filtro. Foram percorridas todas as páginas, conferindo contagem, IDs únicos e resumos globais. Nenhuma massa foi criada na base operacional.

O teste de navegador `tests/discount-pagination.browser.mjs` validou última página, busca e mudança para 50 registros por página; seleção de cliente e produto além da primeira página; venda de R$ 100 com desconto de R$ 10 e entrada de R$ 20; extrato com mais de 200 títulos, total agregado e pagamento em outra página; layout de 390px sem overflow e sem erros JavaScript.

A regressão de fechamento também verificou os campos de desconto, o snapshot completo com mais de 500 títulos e a paginação da lista de fechamentos. O JSON preservado continua completo e seu SHA-256 foi conferido após o fechamento. As capturas são locais e não são versionadas.

Também foi migrado um volume antigo de teste de V2 para V3: três snapshots do formato 1 mantiveram seus hashes e cinco vendas antigas mantiveram seus totais, com desconto zero. Esse teste foi somente de leitura após a migração e não alterou os snapshots.
