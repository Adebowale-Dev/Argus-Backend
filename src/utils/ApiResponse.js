export class ApiResponse {
  constructor(message, data = {}, meta) {
    this.success = true;
    this.message = message;
    this.data = data;
    if (meta) this.meta = meta;
  }
}
