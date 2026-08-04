require "test_helper"

# O painel do Sidekiq fica montado em /sidekiq, restrito a admins pela
# AdminSessionConstraint (mesma regra do JobPolicy). Quando a constraint falha o
# Rails responde 404 — não revela que o painel existe para quem não é admin.
class SidekiqDashboardTest < ActionDispatch::IntegrationTest
  test "anônimo é bloqueado (rota não casa sem sessão de admin)" do
    get "/sidekiq"
    # Constraint reprovada => acesso negado (404/403 conforme o ambiente);
    # o que importa é que NÃO chega no painel (2xx).
    assert_includes [403, 404], response.status, "esperava acesso negado, veio #{response.status}"
  end

  test "AdminSessionConstraint só casa para admin logado" do
    admin  = User.create!(discord_user_id: "1", username: "admin",  role: :admin)
    member = User.create!(discord_user_id: "2", username: "member", role: :member)

    assert AdminSessionConstraint.matches?(fake_request(admin.id)),  "admin deveria passar"
    refute AdminSessionConstraint.matches?(fake_request(member.id)), "membro não deveria passar"
    refute AdminSessionConstraint.matches?(fake_request(nil)),       "anônimo não deveria passar"
  end

  private

  def fake_request(user_id)
    Struct.new(:session).new({ user_id: user_id })
  end
end
