class StatPolicy < ApplicationPolicy
  def index? = user&.admin?
end
