export class KycProvider {
  constructor(name) { this.name = name; }
  async createVerification() { throw new Error('createVerification não implementado.'); }
  async getVerification() { throw new Error('getVerification não implementado.'); }
  verifyWebhook() { throw new Error('verifyWebhook não implementado.'); }
}

export function createKycProvider() {
  const name = process.env.KYC_PROVIDER || 'disabled';
  const error = new Error(name === 'disabled'
    ? 'Nenhum provedor KYC foi selecionado. O cadastro financeiro permanece bloqueado.'
    : `O adaptador KYC "${name}" ainda não foi instalado/configurado.`);
  error.code = 'KYC_PROVIDER_NOT_CONFIGURED';
  error.statusCode = 503;
  throw error;
}
