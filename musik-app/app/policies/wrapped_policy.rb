class WrappedPolicy < ApplicationPolicy
  def index? = user&.admin?
end
