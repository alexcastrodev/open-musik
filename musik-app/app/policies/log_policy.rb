class LogPolicy < ApplicationPolicy
  def index? = user&.admin?
end
