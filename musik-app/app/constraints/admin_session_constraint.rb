# Constraint de rota para o painel do Sidekiq (/sidekiq): só casa quando há um
# usuário logado com role admin na sessão — a mesma regra do JobPolicy#index?.
# Quando não casa, o Rails responde 404, sem revelar que a rota existe.
class AdminSessionConstraint
  def self.matches?(request)
    user_id = request.session[:user_id]
    user_id.present? && User.find_by(id: user_id)&.admin?
  end
end
