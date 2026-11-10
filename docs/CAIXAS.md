# Quilos e caixas

Caixa é uma forma de informar a quantidade do mesmo produto. Não cria outro produto ou estoque separado. Cada produto começa com peso padrão de **15 kg por caixa**; em **Produtos** ou **Estoque**, use **Alterar peso da caixa** para mudar a sugestão.

Em compras, vendas, perdas e implantação de saldo inicial, escolha **Informar quantidade em → Caixas**. Informe quantas caixas e confira o peso de cada uma. É possível ajustar esse peso no lançamento, sem modificar o padrão do produto. O formulário mostra a conversão antes de salvar: **2 caixas × 15 kg = 30 kg**. Frações de caixa são aceitas, desde que o peso resultante seja exato em gramas.

Preço e custo continuam informados **por kg**. Em compras e vendas por caixa, também aparece o valor de uma caixa como referência. Descontos, fiado, pagamentos, custo médio, lucro, dashboards, resumos CSV e cancelamentos usam os quilos convertidos. Valores que exigiriam arredondar o estoque para uma fração de grama são recusados.

O Estoque mostra os quilos e a equivalência no peso padrão atual: **35 kg → 2 caixas + 5 kg**, se a caixa pesa 15 kg. Essa equivalência não representa caixas fisicamente separadas ou lotes. Alterar o padrão muda somente a sugestão e a equivalência visual, sem movimentar mercadoria ou alterar custo.

Os itens de compra e venda guardam a quantidade de caixas e o peso utilizado, visíveis em **Ver itens**. Uma venda de caixas de 10 kg mantém esse registro mesmo depois de mudar o padrão para 20 kg. Perdas e saldos iniciais guardam a quantidade final em kg. Novos snapshots de fechamento usam versão 5 e incluem os dados de caixas dos itens; snapshots antigos permanecem preservados.

## Saldo inicial depois do primeiro lançamento

O menu **Saldo inicial** e seu lembrete deixam de aparecer depois da primeira compra, venda, despesa, perda ou pagamento. Cadastrar clientes, fornecedores e produtos não conta como lançamento operacional. Cancelar um lançamento não reabre a implantação: o histórico já existe e deve continuar preservado. Saldos iniciais confirmados continuam no banco e nos snapshots de fechamento, mesmo com o menu oculto.
