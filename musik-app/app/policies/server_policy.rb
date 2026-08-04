class ServerPolicy < ApplicationPolicy
  def index? = user&.admin?
end
