# Testes no computador e no celular

## 1. Teste automatizado

Na pasta do projeto, execute:

```bash
node --version
npm test
```

Use Node.js 18 ou superior. O resultado esperado é a indicação de que todos os testes passaram e nenhum falhou.

Os testes verificam, entre outros pontos:

- aplicação da mesma tentativa aos quatro tabuleiros do Quarteto;
- tratamento correto de letras repetidas;
- proteção das respostas pelo servidor;
- seleção Português, English e Misto;
- bloqueio de palavra já usada;
- não repetição diária entre partidas;
- estrutura e IDs da interface.

## 2. Teste no computador

Inicie o projeto:

```bash
npm start
```

O terminal mostrará o endereço real. Normalmente será `http://localhost:8080`, mas outra porta poderá ser escolhida automaticamente se a 8080 já estiver ocupada.

### Roteiro de conferência

1. Abra o lobby e confirme que os quatro jogos aparecem.
2. Alterne entre Português, English e Misto; o contador de estoque deve mudar.
3. Abra o Quarteto e confirme quatro tabuleiros e nove linhas.
4. Faça um chute: a mesma palavra deve aparecer nos quatro tabuleiros.
5. Abra o Contexto, envie a mesma palavra duas vezes e confirme a mensagem `Palavra já usada.`.
6. Abra o Termo e confira as seis linhas e as cores das letras.
7. Abra o Anagrama, forme uma palavra e confirme pontos e cronômetro.
8. Volte ao lobby entre as partidas e teste os sons.
9. Redimensione a janela para conferir que textos, botões e tabuleiros não ultrapassam a tela.
10. Abra as ferramentas do navegador e confirme que não existem erros vermelhos no Console.

### Simular um celular no navegador do computador

No Chrome ou Edge:

1. Pressione `F12`.
2. Clique no ícone de celular/tablet.
3. Teste larguras de 320, 375, 390 e 430 pixels.
4. Alterne entre orientação vertical e horizontal.
5. Recarregue a página em cada tamanho.

No Firefox, pressione `Ctrl+Shift+M` para abrir o modo de design responsivo.

## 3. Teste em um celular real

### Preparação

1. Conecte o computador e o celular à mesma rede Wi-Fi.
2. Desative temporariamente VPNs nos dois aparelhos.
3. Evite uma rede de visitantes, pois ela pode impedir a comunicação entre dispositivos.
4. Na pasta do projeto, execute `npm run start:lan`.

O terminal mostrará um ou mais endereços. Use no celular aquele que começa com `http://192.168.`, `http://10.` ou `http://172.`. Exemplo:

```text
Léxora disponível em:
  http://localhost:8080
  http://192.168.1.10:8080
```

No navegador do celular, abra `http://192.168.1.10:8080`. O número será diferente conforme a sua rede.

### Firewall

- Windows: quando o sistema perguntar, permita o Node.js apenas em redes privadas.
- macOS: permita conexões de entrada para o Node.js se aparecer a solicitação.
- Ubuntu com UFW: se necessário, libere somente a porta exibida com `sudo ufw allow 8080/tcp`. Depois do teste, remova a regra com `sudo ufw delete allow 8080/tcp`.

Se o servidor escolher 8081, 8082 ou outra porta, use e libere essa mesma porta.

### Roteiro no celular

1. Teste em orientação vertical e horizontal.
2. Confira se o seletor de idioma pode ser rolado horizontalmente.
3. Confirme que todos os botões respondem ao toque.
4. Jogue uma rodada de cada modo.
5. No Quarteto, confira se os quatro tabuleiros e o teclado cabem na tela.
6. Abra e feche o teclado virtual no Contexto e no Termo.
7. Bloqueie e desbloqueie a tela durante o Anagrama para observar o cronômetro.
8. Atualize a página e confirme que o saldo demonstrativo permanece.

## 4. Testar uma porta específica

Somente no computador:

```bash
node server/server.js --port 9000
```

Na rede local:

```bash
node server/server.js --host 0.0.0.0 --port 9000
```

## 5. Solução de problemas

### O celular não abre o endereço

- Confirme que o processo continua aberto no terminal.
- Use o endereço de rede, nunca `localhost`.
- Confirme que os dois aparelhos estão no mesmo Wi-Fi.
- Desative VPN, proxy ou isolamento de clientes da rede.
- Confira se o firewall liberou a porta correta em rede privada.
- Teste `http://IP_DO_COMPUTADOR:PORTA/api/health` no celular. Deve aparecer um JSON com `"ok": true`.

### A página antiga continua aparecendo

- Faça uma atualização forçada com `Ctrl+Shift+R` no computador.
- No celular, feche a aba e abra o endereço novamente.
- Confirme no terminal se você está executando a pasta correta.

### A porta está ocupada

O servidor tenta automaticamente as próximas nove portas. Use exatamente a URL impressa no terminal ou escolha uma porta livre com `--port`.

### Encerrar o servidor

Volte ao terminal em que ele está rodando e pressione `Ctrl+C`.

## 6. Segurança do teste local

`npm run start:lan` expõe esta demonstração apenas à rede alcançável pelo computador. Use-o em uma rede privada confiável e encerre o servidor depois dos testes. Esse modo não transforma o projeto em uma implantação pública segura.
